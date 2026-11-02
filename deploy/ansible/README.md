# Deploy to your own host with Ansible

This is the deployment path for a dedicated Debian/Ubuntu host with SSH, Docker Compose and local
PostgreSQL. No hosted app platform or managed database is required. See the
[Keycloak production guide](../keycloak/production/README.md) for Google setup and operating boundaries.

Use a Linux/WSL controller with Python 3.11+ and `ansible-core>=2.19,<2.20`. Only built-in modules are
used; no Galaxy collections are needed. Keep host-key checking enabled. The playbook does not change
firewall rules, remove volumes, run database resets, provision allocations or run inference jobs.
It uses the fixed Compose project `builder-console`; use a dedicated host or inspect existing projects
first. Do not run concurrent releases against the same host.

Install the controller dependency with `python3 -m pip install -r deploy/ansible/requirements.txt`
inside a virtual environment.

## Existing Apache hosts

Set `edge_mode: apache` to retain the host's existing Apache listener and sites. The playbook requires
its `proxy`, `proxy_http`, `ssl`, `headers` and `rewrite` modules and Certbot to already be available.
It adds only `builder-console-http.conf` / `builder-console-https.conf`, refuses to overwrite files
without its management marker, validates Apache before each graceful reload, and obtains a separate
`builder-console` certificate for the two new names. Keycloak binds loopback port 18081; the console
keeps loopback port 3060. Check both are free before deployment. The auth vhost proxies only the public
realm/resources paths; administration remains private and denied paths return 403 with Apache.

Use `use_existing_acme_account: true` to reuse the host's existing registered Certbot account. Otherwise
the supplied `acme_email` is used for registration. DNS must already point at the host for HTTP-01.

If DNS or Google configuration is still pending, `edge.yml` can prepare the new hostnames separately.
Set `edge_issue_certificate: false` to install only their HTTP challenge/redirect virtual hosts while
waiting for DNS. Rerun with certificates enabled once DNS resolves; HTTPS returns 503 on both names
until `deploy.yml` installs the real proxy routes. In the normal identity-only deployment, auth is
live but the app stays 503 until the full stack is configured. Keep
`validate_public_endpoints: true` for a completed rollout; setting it false allows a staged private
installation, which must not be reported as publicly verified.

## External deployment inputs

Provide an existing inventory with a `builder` group and settings from outside this checkout.
This repository does not generate host inventories or manage access keys. Use
[vars.example.yml](vars.example.yml) only as an option reference; keep actual credentials,
connection details and private settings outside version control. Provisioning and secret-copy tasks
use `no_log`. Avoid debug mode/diffs and do not print resolved Compose config.

Archive the reviewed commit on the controller, then set `source_archive` to its absolute path and
`release_revision` to that full commit SHA. Archive committed source only, never a working directory
containing secrets or `node_modules`:

```sh
git archive --format=tar.gz --output="$SOURCE_ARCHIVE" HEAD
git rev-parse HEAD
ansible-playbook -i "$INVENTORY" deploy/ansible/deploy.yml \
  -e "@$SETTINGS_FILE" --syntax-check
ansible-playbook -i "$INVENTORY" deploy/ansible/deploy.yml \
  -e "@$SETTINGS_FILE"
```

`--check` can inspect existing hosts but cannot simulate installing Docker and starting containers.
The default `deployment_mode: identity` starts only PostgreSQL, Keycloak and Caddy, then verifies the
public HTTPS issuer. The console hostname returns 502 until the full stack is started. Both domains
must already point at the host and ports 80/443 must be available. Confirm real Google login after
the full console is deployed; identity-only mode validates the issuer and HTTPS.

By default Docker must already exist. Set `install_docker: true` to install it from the official Docker
apt repository when Compose is absent. Review package conflicts first on a host running other workloads.

## Full stack and repeat releases

For an existing remote engine/payment stack, use `deployment_mode: remote` and `edge_mode: apache`.
This uses the standalone `production/remote.compose.yaml`, containing only the console, Keycloak
and Keycloak's private PostgreSQL database. It does not start a local engine, Batteries, discovery
or signer, and does not load the payer environment/secrets. Existing engine/Batteries/Postgres
services and state stay on their current platform. Supply `remote_console_env` privately:

```yaml
deployment_mode: remote
edge_mode: apache
remote_console_env: |
  CONSOLE_ENGINE_URL='https://engine.example'
  CONSOLE_BATTERIES_URL='https://batteries.example'
  CONSOLE_BATTERIES_TOKEN='DEDICATED_READ_ONLY_TOKEN'
  CONSOLE_DISCOVERY_URL='https://discovery.example'
```

The remote engine must accept this Keycloak issuer, the configured audience, strict `at+jwt` tokens
and the role-gated scopes in the production guide. Retain its existing API-key mode when other
clients use it. Background engine reads use Keycloak's reader client, not an engine admin key.
Batteries must be reachable over HTTPS and have a dedicated read-only credential; do not transfer
its operator token. Keep remote Postgres private: the console does not connect to the engine database.
For a Railway Batteries service without a reader credential hook, use the optional
[Railway reader deployment](../railway-reader/README.md).
Signer metrics can remain unconfigured and are labelled unavailable; no signer key or public metrics
listener is needed by this deployment.

An existing configuration generated before `STACK_MODE` was introduced can select remote mode on
its next release. Once a mode is persisted, `init` refuses changing it silently; review the service
and state transition explicitly. Keycloak's database volume is preserved under the same Compose project.

For `deployment_mode: full`, provide `builder_stack_env` and `builder_secrets_directory` from the
completed [base stack bootstrap](../README.md). The playbook copies these files privately, builds
the pinned stack images and starts the services. Starting the signer is operationally significant:
stop every other signer for the same payer first. The playbook never runs a paid test job.

Files live under `/opt/builder-console` by default:

- `releases/COMMIT`: reviewed source plus release-local generated realm configuration.
- `shared/stack.env`, `shared/keycloak.env`, `shared/secrets/`: persistent private configuration.
- `current`: symlink updated only after the public issuer checks succeed.
- Docker named volumes retain the Keycloak database, engine state, payment state and TLS data.

Reruns preserve generated credentials. Host/Google changes are refused by the initial-config script
rather than silently changing identity. Apply the production guide's live rotation procedure first
and update the shared configuration and external settings together. Existing realms are never deleted or
overwritten by startup import. Each new source revision must use a new `release_revision` and archive.

Before upgrades, take encrypted off-host database and secret backups and verify restore. Rolling back
source changes requires running Compose from the previous release; switching `current` alone does not
change containers. Database schema upgrades may require restoring a matching backup. The playbook does
not perform unattended schema downgrades or restart a different host workload.
