#!/usr/bin/env python3
"""Generate a fresh production realm; operate it without publishing the Admin API.

Python 3.10+, standard library only. No engine calls, allocations or paid jobs.
"""

import argparse
import copy
import getpass
import json
import os
from pathlib import Path
import re
import secrets
import shlex
import subprocess
import sys
import tempfile


HERE = Path(__file__).resolve().parent
DEPLOY = HERE.parents[1]
UUID = re.compile(r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}")


def hostname(value):
    if len(value) > 253 or "." not in value or not all(
        re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label)
        for label in value.split(".")
    ):
        raise ValueError("Hosts must be lowercase DNS names, without scheme, port or path")
    if value.endswith((".localhost", ".local")) or value == "localhost":
        raise ValueError("Use public DNS names for automatic HTTPS")
    return value


def origin(value):
    if not value.startswith("https://"):
        raise ValueError("Engine audience must be an HTTPS origin")
    hostname(value.removeprefix("https://"))
    return value


def realm_config(console_host, audience):
    """Reuse the tested scope/role mappings, excluding every demo identity and credential."""
    realm = json.loads((HERE.parent / "realm-livepeer.json").read_text())
    realm.update({
        "displayName": "Livepeer builder",
        "sslRequired": "all",
        "registrationAllowed": False,
        "resetPasswordAllowed": False,
        "rememberMe": False,
        "duplicateEmailsAllowed": False,
        "editUsernameAllowed": False,
        # Email is profile data; the Keycloak UUID, not email, is the engine identity.
        # No blanket trust of arbitrary Google-account email addresses and no SMTP dependency.
        "verifyEmail": False,
        "bruteForceProtected": True,
        "eventsEnabled": True,
        "eventsExpiration": 604800,
        "adminEventsEnabled": True,
        "adminEventsDetailsEnabled": False,
        "browserFlow": "google-browser",
    })
    realm["roles"]["realm"].append({
        "name": "default-roles-livepeer", "composite": True,
        "composites": {"realm": ["builder"]},
    })
    realm["defaultRole"] = {"name": "default-roles-livepeer"}
    realm["users"] = [copy.deepcopy(user) for user in realm["users"] if user.get("serviceAccountClientId")]
    # Let the database assign service-account UUIDs; no demo user IDs survive.
    for user in realm["users"]:
        user.pop("id", None)
    for scope in realm["clientScopes"]:
        if scope["name"] == "engine-audience":
            scope["protocolMappers"][0]["config"]["included.custom.audience"] = audience
    console = realm["clients"][0]
    console["redirectUris"] = [f"https://{console_host}/auth/callback"]
    console["webOrigins"] = [f"https://{console_host}"]
    console["attributes"]["post.logout.redirect.uris"] = "##".join(
        f"https://{console_host}/{area}" for area in ("operator", "builder")
    )
    realm["identityProviders"] = [{
        "alias": "google", "providerId": "google", "enabled": True,
        "trustEmail": False, "storeToken": False, "linkOnly": False,
        "firstBrokerLoginFlowAlias": "google-first-login",
        "config": {
            "clientId": "${GOOGLE_CLIENT_ID}",
            "clientSecret": "${GOOGLE_CLIENT_SECRET}",
            "defaultScope": "openid profile email", "syncMode": "IMPORT",
        },
    }]
    realm["authenticatorConfig"] = [{
        "alias": "google-redirect", "config": {"defaultProvider": "google"},
    }]
    realm["authenticationFlows"] = [
        {
            "alias": "google-browser", "providerId": "basic-flow", "topLevel": True, "builtIn": False,
            "authenticationExecutions": [{
                "authenticator": "identity-provider-redirector", "authenticatorConfig": "google-redirect",
                "requirement": "REQUIRED", "priority": 10, "authenticatorFlow": False,
                "userSetupAllowed": False,
            }],
        },
        {
            # Fail on an existing-email collision. No auto-link, email-link or password-link flow.
            "alias": "google-first-login", "providerId": "basic-flow", "topLevel": True, "builtIn": False,
            "authenticationExecutions": [{
                "authenticator": "idp-create-user-if-unique", "requirement": "REQUIRED",
                "priority": 10, "authenticatorFlow": False, "userSetupAllowed": False,
            }],
        },
    ]
    return realm


def read_env(path):
    """Read only our generated, single-quoted dotenv format; never evaluate shell input."""
    if not path.exists():
        return {}
    result = {}
    for line in path.read_text().splitlines():
        if not line or line.startswith("#"):
            continue
        match = re.fullmatch(r"([A-Z0-9_]+)='([^']*)'", line)
        if not match:
            raise ValueError("Invalid generated environment file; restore its single-quoted format")
        result[match[1]] = match[2]
    return result


def write_private(path, text):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, temporary = tempfile.mkstemp(dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as output:
            output.write(text)
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def initialize(args):
    existing = read_env(HERE / ".env")
    values = dict(existing)
    supplied = {
        "AUTH_HOST": args.auth_host, "CONSOLE_HOST": args.console_host,
        "ENGINE_AUDIENCE": args.engine_audience, "ACME_EMAIL": args.acme_email,
        "GOOGLE_CLIENT_ID": args.google_client_id or os.environ.get("GOOGLE_CLIENT_ID"),
        "GOOGLE_CLIENT_SECRET": os.environ.get("GOOGLE_CLIENT_SECRET"),
        "EDGE_MODE": getattr(args, "edge_mode", None),
        "STACK_MODE": getattr(args, "stack_mode", None),
    }
    for name, value in supplied.items():
        if value is not None:
            if name in existing and existing[name] != value:
                raise ValueError(f"{name} changed: init is first-install only; use the documented rotation procedure")
            values[name] = value
    values.setdefault("EDGE_MODE", "caddy")
    values.setdefault("STACK_MODE", "local")
    if values["STACK_MODE"] == "remote" and values["EDGE_MODE"] != "apache":
        raise ValueError("The remote-service deployment uses the existing Apache edge; set --edge-mode apache")
    if values["EDGE_MODE"] == "apache":
        values.setdefault("ACME_EMAIL", "")
    required = ["AUTH_HOST", "CONSOLE_HOST", "ENGINE_AUDIENCE", "GOOGLE_CLIENT_ID"]
    if values["EDGE_MODE"] == "caddy":
        required.append("ACME_EMAIL")
    for name in required:
        if not values.get(name):
            raise ValueError(f"Missing {name}; see init --help")
    hostname(values["AUTH_HOST"])
    hostname(values["CONSOLE_HOST"])
    if values["AUTH_HOST"] == values["CONSOLE_HOST"]:
        raise ValueError("Auth and console must have different DNS names")
    origin(values["ENGINE_AUDIENCE"])
    if values["ACME_EMAIL"] and not re.fullmatch(r"[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+", values["ACME_EMAIL"]):
        raise ValueError("ACME_EMAIL must be an email address")
    if not re.fullmatch(r"[A-Za-z0-9_-]+\.apps\.googleusercontent\.com", values["GOOGLE_CLIENT_ID"]):
        raise ValueError("Use a Google Web application OAuth client ID")
    if not values.get("GOOGLE_CLIENT_SECRET"):
        if not sys.stdin.isatty():
            raise ValueError("Set GOOGLE_CLIENT_SECRET in the environment for non-interactive init")
        values["GOOGLE_CLIENT_SECRET"] = getpass.getpass("Google client secret: ")
    if not values["GOOGLE_CLIENT_SECRET"]:
        raise ValueError("GOOGLE_CLIENT_SECRET cannot be empty")
    for name in ("KEYCLOAK_DB_PASSWORD", "KC_BOOTSTRAP_ADMIN_PASSWORD", "BUILDER_CONSOLE_CLIENT_SECRET",
                 "CONSOLE_READER_CLIENT_SECRET", "CONSOLE_SESSION_SECRET"):
        values.setdefault(name, secrets.token_urlsafe(48))
    values.setdefault("KC_BOOTSTRAP_ADMIN_USERNAME", "bootstrap-admin")
    if any(any(char in value for char in "'\r\n\x00") for value in values.values()):
        raise ValueError("Environment values cannot contain quotes, newlines or NULs")
    rendered = json.dumps(realm_config(values["CONSOLE_HOST"], values["ENGINE_AUDIENCE"]), indent=2) + "\n"
    write_private(HERE / "runtime" / "livepeer-realm.json", rendered)
    # The non-root Keycloak container must read this bind mount. It contains placeholders,
    # not secrets; the host runtime directory remains private and .env stays mode 0600.
    os.chmod(HERE / "runtime" / "livepeer-realm.json", 0o644)
    write_private(HERE / ".env", "# Generated by configure.py; contains secrets. Do not commit.\n" + "".join(
        f"{name}='{value}'\n" for name, value in sorted(values.items())
    ))
    print("Configuration ready; existing secrets preserved. No services started or live realms changed.")
    print(f"Google authorized redirect URI: https://{values['AUTH_HOST']}/realms/livepeer/broker/google/endpoint")


def compose_command():
    if not (HERE / ".env").exists():
        raise ValueError("Run configure.py init first")
    values = read_env(HERE / ".env")
    if values.get("STACK_MODE") == "remote":
        return ["docker", "compose", "--project-name", "builder-console", "--env-file", str(HERE / ".env"),
                "-f", str(HERE / "remote.compose.yaml")]
    command = ["docker", "compose", "--project-name", "builder-console",
            "--env-file", str(DEPLOY / ".env"), "--env-file", str(HERE / ".env"),
            "-f", str(DEPLOY / "compose.yaml"), "-f", str(HERE / "compose.yaml")]
    if read_env(HERE / ".env").get("EDGE_MODE") == "apache":
        command += ["-f", str(HERE / "apache.compose.yaml")]
    return command


def admin(arguments, raw=False):
    """Authenticate inside the container. Secrets and admin endpoints never go on the public network."""
    script = '''set -eu
config=$(mktemp /tmp/kcadm.XXXXXXXX)
trap 'rm -f "$config"' EXIT
/opt/keycloak/bin/kcadm.sh config credentials --config "$config" \\
  --server http://localhost:8080 --realm master \\
  --user "${KC_BOOTSTRAP_ADMIN_USERNAME:?}" --password "${KC_BOOTSTRAP_ADMIN_PASSWORD:?}" >/dev/null
/opt/keycloak/bin/kcadm.sh ''' + shlex.join(arguments) + ' --config "$config"\n'
    result = subprocess.run(compose_command() + ["exec", "-T", "keycloak", "bash", "-s"],
                            input=script.encode("utf-8"), capture_output=True, check=False)
    if result.returncode:
        # Avoid echoing command output that might contain credentials or full identity records.
        raise ValueError("Keycloak admin command failed; check health and the private admin credentials")
    if raw:
        return result.stdout.decode("utf-8")
    return json.loads(result.stdout) if result.stdout.strip() else None


def operator(args):
    if not UUID.fullmatch(args.user_id):
        raise ValueError("Use the Keycloak UUID from the actor list, never an email or Google subject")
    user = admin(["get", f"users/{args.user_id}", "-r", "livepeer"])
    links = admin(["get", f"users/{args.user_id}/federated-identity", "-r", "livepeer"])
    if not user.get("enabled") or not any(link["identityProvider"] == "google" for link in links):
        raise ValueError("The selected user must be enabled and have an existing Google login")
    action = "add-roles" if args.command == "grant-operator" else "remove-roles"
    admin([action, "-r", "livepeer", "--uid", args.user_id, "--rolename", "operator"])
    print(f"{args.command} succeeded for Keycloak user {args.user_id}. Sign out and back in.")
    print("Existing access tokens expire within five minutes; no engine allocation was changed.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    init = commands.add_parser("init", help="Generate initial files; preserve existing secrets on rerun")
    for option in ("auth-host", "console-host", "engine-audience", "acme-email", "google-client-id"):
        init.add_argument(f"--{option}")
    init.add_argument("--edge-mode", choices=("caddy", "apache"), help="Use an existing Apache TLS edge instead of Caddy")
    init.add_argument("--stack-mode", choices=("local", "remote"), help="remote: deploy only console/identity; keep engine and payments remote")
    stack = commands.add_parser("stack", help="Run Docker Compose with the production overlay")
    stack.add_argument("arguments", nargs=argparse.REMAINDER)
    private_admin = commands.add_parser("admin", help="Run kcadm privately inside Keycloak; output may contain secrets")
    private_admin.add_argument("arguments", nargs=argparse.REMAINDER)
    for command in ("grant-operator", "revoke-operator"):
        role = commands.add_parser(command, help="Change the operator role of an existing Google user by UUID")
        role.add_argument("--user-id", required=True)
    args = parser.parse_args()
    try:
        if args.command == "init":
            initialize(args)
        elif args.command in ("stack", "admin"):
            arguments = args.arguments[1:] if args.arguments[:1] == ["--"] else args.arguments
            if not arguments:
                raise ValueError("Supply a command after --")
            if args.command == "admin":
                print(admin(arguments, raw=True), end="")
            else:
                return subprocess.run(compose_command() + arguments, check=False).returncode
        else:
            operator(args)
    except (ValueError, OSError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
