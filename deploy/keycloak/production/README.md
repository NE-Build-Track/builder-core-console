# Production Keycloak with Google

Run the existing builder stack on a Linux host with Docker Compose, PostgreSQL-backed Keycloak and
Caddy HTTPS. Google authenticates people; Keycloak issues the engine's RFC 9068 access tokens.
There is no Auth0, Railway, Vercel or managed-database dependency. Auth0 remains an independent
deployment example; this setup uses the OIDC client already in main and does not require that branch.
Software has no subscription fee. Hosting, DNS and paid inference are separate costs.

For remote installation and repeat releases, use the [Ansible playbook](../../ansible/README.md).
This directory also supports operating Compose directly. It is a single-host deployment, not HA.

If the engine, Batteries and their database already run elsewhere, use the
[remote-service deployment](../../ansible/README.md#full-stack-and-repeat-releases). Only the console
and identity services run on this host; their Compose file never loads payment credentials or starts
a signer. Keycloak has its own private identity database, separate from the engine's remote Postgres.

On a host that already uses Apache for 80/443, choose `--edge-mode apache` at initialization and
`edge_mode: apache` in Ansible. The third overlay disables Caddy and publishes Keycloak only on
`127.0.0.1:18081`; Ansible adds two new virtual hosts and a separate Certbot certificate without
editing other sites. See [Apache coexistence](../../ansible/README.md#existing-apache-hosts).

## Prerequisites

- A dedicated Linux host, Docker Engine with Compose v2, Python 3.10+, and sufficient space for the
  stack's images and databases. Budget at least 4 GiB RAM initially, then measure actual load.
- Two public DNS names pointing to it: `auth.example.com` and `console.example.com`. Correct both A
  and AAAA records. Allow TCP 80/443 for Caddy and SSH only from trusted administration networks.
- Existing payer/Batteries configuration from [deploy/README.md](../../README.md) for a full stack.
  Never run two signers for the same payer. The overlay uses the existing `builder-console` project
  and its engine/payment volumes; take backups before changing a running deployment.
- A Google OAuth **Web application** client owned by the team. In Google Auth Platform, configure
  branding, audience and your public privacy-policy/homepage links; move the app to production
  instead of leaving it restricted to test users. Request only `openid profile email`.

Google's authorized redirect URI is **Keycloak's broker endpoint**, not the console callback:

```text
https://auth.example.com/realms/livepeer/broker/google/endpoint
```

The console callback, registered by the script in Keycloak, is:

```text
https://console.example.com/auth/callback
```

See [Google OIDC setup](https://developers.google.com/identity/openid-connect/openid-connect).
The engine audience is a stable HTTPS resource identifier, e.g. `https://engine.example.com`; it
does not require a publicly reachable engine. The engine remains bound to host loopback.

## Generate initial configuration

From the repository root, after preparing `deploy/.env` and `deploy/secrets` as above:

```sh
python3 deploy/keycloak/production/configure.py init \
  --auth-host auth.example.com \
  --console-host console.example.com \
  --engine-audience https://engine.example.com \
  --acme-email ops@example.com \
  --google-client-id YOUR_CLIENT.apps.googleusercontent.com
```

Enter the Google secret at the hidden prompt. Automation can supply `GOOGLE_CLIENT_SECRET` through
its environment or externally supplied private settings; never put it on the command line. The script creates:

- `production/.env`: generated database, bootstrap-admin, two client and session secrets plus your
  Google credentials, mode 0600. Back it up encrypted. Windows users must also restrict its ACL.
- `production/runtime/livepeer-realm.json`: no demo people or passwords; secret values remain
  environment placeholders. This directory is ignored by Git and the console Docker build.
  The realm file is mode 0644 so the non-root container can read its bind mount; its host directory
  remains private and the separate secret-bearing env file remains mode 0600.

Repeated `init` preserves secrets and refuses changed deployment inputs. It neither starts services
nor updates an existing realm. The overlay sets production OIDC configuration explicitly and
turns off HTTP issuers; it leaves the default local stack configuration unchanged.

```sh
python3 deploy/keycloak/production/configure.py stack -- config -q
# Identity-only start for DNS, HTTPS and Google verification. No signer starts.
python3 deploy/keycloak/production/configure.py stack -- up -d --build --wait keycloak edge
# With payer configuration ready and every other signer for that payer stopped:
python3 deploy/keycloak/production/configure.py stack -- up -d --build --wait
```

`stack` always loads the base Compose file, this overlay and both environment files, independent of
the working directory. Use it for subsequent `ps`, `logs`, `restart`, `exec`, `stop` and `up` commands.
Avoid plain `docker compose up`, which would omit the production overlay.
In Apache mode, omit `edge` from identity-only commands; do not explicitly start the disabled Caddy service.

## Signup, operators and allocations

1. Open `https://console.example.com/builder` and sign in with Google. First login creates a durable
   Keycloak UUID with the **builder** role. It grants no admin permission and no money. The engine
   registers the actor on first authenticated use; an unfunded builder cannot run a paid job.
2. Grant the first operator explicitly from the host, after that person has logged in once. Obtain
   their Keycloak UUID using the private admin command below; check the Google identity attached
   to it. Never choose an operator by an unverified email string.
3. Sign out and back in as that operator. Provision the existing actor's UUID from a grant using
   the console's normal reviewed allocation action. There is no automatic credit on signup.

```sh
python3 deploy/keycloak/production/configure.py admin -- get users -r livepeer
python3 deploy/keycloak/production/configure.py grant-operator --user-id KEYCLOAK_UUID
python3 deploy/keycloak/production/configure.py revoke-operator --user-id KEYCLOAK_UUID
```

The role commands require an enabled user with a Google identity already linked. They never create
users, allocate funds or call the engine. Existing access tokens expire within five minutes after
role removal. An existing-email collision fails first login instead of linking accounts; no linking
flow is configured. Keycloak UUIDs, not email or Google's upstream subject, identify engine actors.
Do not delete and recreate users or the realm to resolve login problems: that breaks allocation identity.

Google is the only browser login method; local password registration and reset are disabled. Email
is profile data, not an authorization key, and `trustEmail` is false. There is no app verification-email
workflow and no SMTP requirement. If verified-email-based features are added later, implement and
test an explicit verification policy before relying on the email flag.

## Public and private boundaries

- Caddy, or the existing Apache server, owns 80/443. The engine and console retain their loopback bindings. Keycloak,
  PostgreSQL, Batteries, signer and metrics have no public host ports.
- Caddy terminates HTTPS on this single host, overwrites forwarded headers and proxies Keycloak
  only on its private Docker network. Do not add an external HTTP listener for Keycloak.
- Only `/realms/livepeer/*`, `/resources/*` and `/robots.txt` are public on the auth hostname.
  `/admin`, the master realm, health and metrics are denied. Use the private admin CLI, not a public
  administrator console. Admin commands execute `kcadm` within the container and remove temporary
  token files when finished.
- `CONSOLE_PROTECT_READS=true` gates all stack-wide pages on a live engine-authorized operator
  session. Anonymous and builder visits go to `/operator`; builder/auth routes remain available.
  Shared-layout counts and health are suppressed without operator access. Errors fail closed for
  these reads; authenticated HTML/RSC responses are private and not cached at the edge.
- The background reader has its own client and only `livepeer:read`. It cannot request the admin
  or builder scopes. Human scopes are role-gated. ID tokens cannot substitute for engine access tokens.
- Use one console replica with refresh-token rotation: the current in-memory refresh deduplication
  is per process. A multi-replica rollout needs shared refresh coordination first.

## Administration, secrets and updates

`admin --` passes arguments to `kcadm` inside Keycloak. It uses the private administration credentials
in `KC_BOOTSTRAP_ADMIN_USERNAME` / `KC_BOOTSTRAP_ADMIN_PASSWORD` from the generated env file.
Output may contain personal data or client secrets: use it only in a private terminal, never CI logs.

The bootstrap account is temporary. Before routine operation, use the private CLI to create a
permanent master-realm administrator, grant `admin`, set a strong password, and verify a separate
login. Then update the two administration variables in the generated env file (and Ansible's shared
copy), recreate Keycloak, verify `admin -- get realms`, and delete the temporary bootstrap user.
The variable names remain the CLI credential source; the bootstrap settings do not overwrite an
existing master realm. Keep independent recovery credentials offline. Follow
[Keycloak administrator recovery](https://www.keycloak.org/server/bootstrap-admin-recovery).

```sh
python3 deploy/keycloak/production/configure.py admin -- get realms
python3 deploy/keycloak/production/configure.py admin -- get users/KEYCLOAK_UUID/federated-identity -r livepeer
```

Keycloak skips startup import when `livepeer` already exists. Re-rendering the JSON or redeploying
does **not** update live clients, roles or Google secrets. Apply reviewed changes through `admin --`
or an explicit migration; never delete/reimport a live realm. Google secret rotation requires updating
`identity-provider/instances/google` in the live realm, then updating the external secret source and
recreating Keycloak. For client-secret rotation, update the live client and its consumer together.
Changing the console session secret signs everyone out. Changing only a PostgreSQL env password
does not rotate an existing database user's password; rotate it in PostgreSQL as well.

Update pinned images regularly after reviewing security advisories. Back up before database or
Keycloak upgrades; do not roll an older Keycloak image onto an upgraded schema.
Readiness includes the database check (metrics are enabled privately for that check). Compose-managed
database updates restart dependent Keycloak. Stop Keycloak before a manual database maintenance operation,
then start it after PostgreSQL is healthy; Docker does not restart unhealthy containers automatically.

## Backup and restore

Use a root-only directory on the host; copy encrypted backups off-host. Example on Linux:

```sh
umask 077
python3 deploy/keycloak/production/configure.py stack -- exec -T keycloak-db \
  pg_dump -U keycloak -d keycloak -Fc > /private/backup/keycloak.dump
```

Back up the generated env file and Caddy data, plus the existing engine and payment databases using
their own consistent backup procedures. A realm JSON export is not a substitute for the database:
it does not preserve all sessions, events and runtime state.

Test restoration on an isolated host: start a fresh PostgreSQL service, restore the dump using
`pg_restore -U keycloak -d keycloak`, restore the same secrets and reviewed image versions, then start
Keycloak and verify the existing user UUIDs, clients and login. Do not attach a test signer to the live payer.
Never use `down -v` as an upgrade or rollback procedure.

## Validation before opening signup

- Run `make check` for the web, Python provisioning and Compose checks. Run the
  [isolated identity smoke commands](#isolated-identity-smoke-test) for real Keycloak tokens and persistence.
- Verify HTTPS discovery's issuer exactly matches `https://AUTH_HOST/realms/livepeer`, including
  its public JWKS URL. Confirm `/admin/` and `/realms/master/` return 404 externally.
- Complete a real Google login after configuring your OAuth client; dummy credentials only test
  realm import. Confirm the UUID and builder role persist after recreating Keycloak.
- Confirm a fresh builder cannot enter Operator or read `/money`, `/users` or layout aggregates;
  verify the same for anonymous HTML and RSC requests. Check that an unfunded user has no spend.
- Grant and revoke an operator, sign out/in, and verify read/write boundaries. Verify reader tokens
  have `typ: at+jwt`, the configured audience, a five-minute lifetime and only the reader scope.
- Test backup restoration and monitor certificate renewal, disk space and private readiness.

References: [production mode](https://www.keycloak.org/server/configuration-production),
[containers](https://www.keycloak.org/server/containers),
[reverse proxies](https://www.keycloak.org/server/reverseproxy),
[realm import behavior](https://www.keycloak.org/server/importExport),
[Google brokering](https://www.keycloak.org/docs/latest/server_admin/index.html#google).

## Isolated identity smoke test

Use a disposable checkout on a development/CI host, not an initialized production checkout. Prepare
`deploy/.env` from its example and run `init` with the example domains and a dummy Google client/secret.
The following commands start only the isolated Keycloak and PostgreSQL services and verify real
reader tokens, role boundaries and persistence; they never start the signer or engine:

```sh
docker compose --project-name builder-console-auth-smoke \
  --env-file deploy/.env --env-file deploy/keycloak/production/.env \
  -f deploy/compose.yaml -f deploy/keycloak/production/compose.yaml \
  up -d --build --wait --wait-timeout 180 keycloak
python3 deploy/keycloak/production/smoke.py
docker compose --project-name builder-console-auth-smoke \
  --env-file deploy/.env --env-file deploy/keycloak/production/.env \
  -f deploy/compose.yaml -f deploy/keycloak/production/compose.yaml \
  up -d --force-recreate --wait --wait-timeout 180 keycloak
python3 deploy/keycloak/production/smoke.py
docker compose --project-name builder-console-auth-smoke \
  --env-file deploy/.env --env-file deploy/keycloak/production/.env \
  -f deploy/compose.yaml -f deploy/keycloak/production/compose.yaml down
```

This smoke client uses a disposable Python container on the test project's private identity network.
It creates/deletes a temporary user and grants/revokes its role within that test realm. It does not
complete a real Google login; that remains a deployment acceptance check with the team's OAuth client.
The existing Actions workflow runs the web tests; Python, Ansible and real-container checks are
provided as explicit commands without changing the repository's workflow permissions.
