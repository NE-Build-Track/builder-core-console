#!/usr/bin/env python3
"""Test an ISOLATED Keycloak import with dummy Google credentials; never start an engine or signer.

Run after starting keycloak in Compose project builder-console-auth-smoke (see CI).
The Python client container stays on the private identity network. No credentials/tokens are printed.
"""

import argparse
import base64
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid


def client():
    base = "http://keycloak:8080"

    def request(path, data=None, token=None, form=False, method=None):
        headers = {"X-Forwarded-Proto": "https", "X-Forwarded-Port": "443"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        if form:
            body = urllib.parse.urlencode(data).encode()
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        else:
            body = json.dumps(data).encode() if data is not None else None
            headers["Content-Type"] = "application/json"
        try:
            with urllib.request.urlopen(urllib.request.Request(base + path, body, headers, method=method), timeout=20) as response:
                content = response.read()
                return json.loads(content) if content else None
        except urllib.error.HTTPError as error:
            raise RuntimeError(f"Private smoke request failed: HTTP {error.code} at {path.split('?')[0]}") from None

    def claims(token):
        return [json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4))) for part in token.split(".")[:2]]

    issuer = f"https://{os.environ['AUTH_HOST']}/realms/livepeer"
    discovery = request("/realms/livepeer/.well-known/openid-configuration")
    assert discovery["issuer"] == issuer
    assert discovery["jwks_uri"].startswith(issuer + "/")
    keys = request("/realms/livepeer/protocol/openid-connect/certs")["keys"]
    reader = request("/realms/livepeer/protocol/openid-connect/token", {
        "grant_type": "client_credentials", "client_id": "console-reader",
        "client_secret": os.environ["CONSOLE_READER_CLIENT_SECRET"], "scope": "livepeer:read",
    }, form=True)
    header, payload = claims(reader["access_token"])
    assert header["typ"] == "at+jwt"
    assert any(key["kid"] == header["kid"] for key in keys)
    assert payload["iss"] == issuer
    audiences = payload["aud"] if isinstance(payload["aud"], list) else [payload["aud"]]
    assert os.environ["ENGINE_AUDIENCE"] in audiences
    assert payload["client_id"] == "console-reader"
    # Allow a small clock-sampling margin around the configured 300-second lifetime.
    assert payload["exp"] - payload["iat"] <= 305, f"Unexpected reader lifetime: {payload['exp'] - payload['iat']} seconds"
    assert payload["scope"].split() == ["livepeer:read"]
    assert payload.get("jti") and payload.get("sub")
    try:
        elevated = request("/realms/livepeer/protocol/openid-connect/token", {
            "grant_type": "client_credentials", "client_id": "console-reader",
            "client_secret": os.environ["CONSOLE_READER_CLIENT_SECRET"], "scope": "livepeer:admin jobs.run",
        }, form=True)
    except RuntimeError as error:
        assert "HTTP 400" in str(error)
    else:
        assert not {"livepeer:admin", "jobs.run"}.intersection(claims(elevated["access_token"])[1]["scope"].split())

    admin_token = request("/realms/master/protocol/openid-connect/token", {
        "grant_type": "password", "client_id": "admin-cli",
        "username": os.environ["KC_BOOTSTRAP_ADMIN_USERNAME"],
        "password": os.environ["KC_BOOTSTRAP_ADMIN_PASSWORD"],
    }, form=True)["access_token"]
    username = "smoke-" + str(uuid.uuid4())
    root = "/admin/realms/livepeer"
    request(root + "/users", {"username": username, "enabled": True}, admin_token)
    uid = request(root + "/users?" + urllib.parse.urlencode({"username": username, "exact": "true"}), token=admin_token)[0]["id"]
    try:
        roles = request(root + f"/users/{uid}/role-mappings/realm/composite", token=admin_token)
        names = {role["name"] for role in roles}
        assert "builder" in names and "operator" not in names and "reader" not in names
        console = request(root + "/clients?clientId=builder-console", token=admin_token)[0]
        evaluate = root + f"/clients/{console['id']}/evaluate-scopes/generate-example-access-token?" + urllib.parse.urlencode({
            "userId": uid, "scope": "jobs.run livepeer:admin",
        })
        builder = request(evaluate, token=admin_token)
        assert "jobs.run" in builder["scope"].split() and "livepeer:admin" not in builder["scope"].split()
        operator = request(root + "/roles/operator", token=admin_token)
        request(root + f"/users/{uid}/role-mappings/realm", [operator], admin_token)
        elevated = request(evaluate, token=admin_token)
        assert "livepeer:admin" in elevated["scope"].split()
        request(root + f"/users/{uid}/role-mappings/realm", [operator], admin_token, method="DELETE")
        assert "livepeer:admin" not in request(evaluate, token=admin_token)["scope"].split()
    finally:
        request(root + f"/users/{uid}", token=admin_token, method="DELETE")
    print("PASS: public issuer/JWKS, strict reader token, no reader elevation, builder defaults, explicit operator grant/revoke")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--client", action="store_true")
    parser.add_argument("--project-name", default="builder-console-auth-smoke")
    args = parser.parse_args()
    if args.client:
        client()
        return 0
    if not args.project_name.endswith("-auth-smoke"):
        parser.error("Use an isolated project name ending in -auth-smoke")
    from configure import HERE, read_env
    values = read_env(HERE / ".env")
    command = ["docker", "run", "--rm", "-i", "--network", args.project_name + "_identity"]
    for name in ("AUTH_HOST", "ENGINE_AUDIENCE", "CONSOLE_READER_CLIENT_SECRET",
                 "KC_BOOTSTRAP_ADMIN_USERNAME", "KC_BOOTSTRAP_ADMIN_PASSWORD"):
        command += ["-e", name]
    command += ["python:3.13-alpine", "python", "-", "--client"]
    result = subprocess.run(command, input=Path(__file__).read_text(), text=True,
                            env={**os.environ, **values}, check=False)
    return result.returncode


if __name__ == "__main__":
    sys.exit(main())
