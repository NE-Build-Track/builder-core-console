# Reliability

## Configuration

The console reads `CONSOLE_*` variables (compose sets the URLs; `deploy/.env` holds the rest):

| Variable | Default | Purpose |
| --- | --- | --- |
| `CONSOLE_ENGINE_URL` | compose: `http://engine:8080` | The engine |
| `CONSOLE_ENGINE_ADMIN_TOKEN` | — | `lpk_` admin key (`first-run.sh`) |
| `CONSOLE_BATTERIES_URL` | compose: `http://clearinghouse:8081` | Batteries management API |
| `CONSOLE_BATTERIES_TOKEN` | — | `console-reader` token (`*.read`) |
| `CONSOLE_SIGNER_URL` | compose: `http://clearinghouse:8937` | The signer's signing port. The console reads nothing there (the signer only signs, builder-core D43) |
| `CONSOLE_DISCOVERY_URL` | compose: `http://discovery:8939` | The discovery service's `GET /discovery` (Network page, nav count) |
| `CONSOLE_SIGNER_METRICS_URL` | compose: `http://clearinghouse:8939` | Signer `/readyz` and `/metrics` via the relay |
| `CONSOLE_APPLICATION_ID` | `default` | The application the admin key reads (gap G9) |
| `CONSOLE_CACHE_TTL_S` | `15` (0–300) | How long one upstream read is reused |
| `CONSOLE_TIMEOUT_S` | `8` (1–60) | Per-request upstream timeout |
| `CONSOLE_SESSION_SECRET` | — (32+ characters) | Seals Operator and Builder sign-ins (D16). Without it, sign-in is off and the console is read-only |
| `CONSOLE_MAX_LIST_ROWS` | `20000` | Row cap per Batteries list (gap G6) |
| `CONSOLE_AUTH` | `keys` | `keys`: sign in by pasting an engine key (D16). `oidc`: sign in through an identity provider (D21); `CONSOLE_ENGINE_ADMIN_TOKEN` is then not used |
| `CONSOLE_OIDC_ISSUER` | — | oidc: the provider's issuer, exactly as its tokens' `iss`; `https` unless `CONSOLE_OIDC_ALLOW_HTTP=true` |
| `CONSOLE_OIDC_CLIENT_ID`, `CONSOLE_OIDC_CLIENT_SECRET` | — | oidc: the console's confidential client (authorization code with PKCE) |
| `CONSOLE_OIDC_REDIRECT_URL` | — | oidc: `/auth/callback` as the browser reaches the console, registered with the provider |
| `CONSOLE_OIDC_OPERATOR_SCOPE`, `CONSOLE_OIDC_BUILDER_SCOPES` | `livepeer:admin`; `discover jobs.run jobs.read costs.read events.read` | oidc: what each area asks for; the engine maps them (builder-core `LPB_JWT_*`) |
| `CONSOLE_OIDC_ALLOW_HTTP` | `false` | oidc: local development only, an http issuer (deploy/keycloak) |
| `CONSOLE_OIDC_OFFLINE_ACCESS` | `false` | oidc: also request `offline_access`, so a provider such as Auth0 returns a refresh token. Leave unset for the local Keycloak, which issues one without being asked |
| `CONSOLE_OIDC_AUDIENCE` | — | oidc: sent as Auth0's `audience` parameter so access tokens name the engine API. Leave unset for the local Keycloak, which stamps the audience itself |
| `CONSOLE_AUTH0_DOMAIN` | — | Provision: the Auth0 tenant host, no scheme. When set with the management client, Provision an actor creates the user before the engine allocation |
| `CONSOLE_AUTH0_MGMT_CLIENT_ID`, `CONSOLE_AUTH0_MGMT_CLIENT_SECRET` | — | Provision: a machine client allowed to create users and assign the builder role. Server only |
| `CONSOLE_AUTH0_CONNECTION` | `Username-Password-Authentication` | Provision: the database connection the new user is created in |
| `CONSOLE_AUTH0_BUILDER_ROLE_ID` | — | Provision: the role id whose permissions are the builder scopes |
| `CONSOLE_AUTH0_OPERATOR_ROLE_ID` | — | Add an operator: the role id whose permission is `livepeer:admin`. Unset leaves builder provisioning working and refuses only that action |
| `CONSOLE_READER_CLIENT_ID`, `CONSOLE_READER_CLIENT_SECRET`, `CONSOLE_READER_SCOPE` | —, —, `livepeer:read` | oidc: the console's own read-only identity (client credentials) for the background reads |

A missing variable does not stop the console: that source reads "not configured: NAME" on every page.

## Failure behaviour

- One source down never blanks a page: every read is a `Reading` (value or named problem), rendered
  where it would have appeared.
- Upstream reads time out after `CONSOLE_TIMEOUT_S`. A page waits at most one timeout per sequential
  read; Users reads actors four at a time.
- The console keeps no state. Restarting it loses only the 15-second cache.
- `/livez` is process liveness and reads nothing upstream; the compose healthcheck uses it.

## Per-worktree dev

`make dev` runs `next dev` on a port derived from the folder name (3100–3899), so several worktrees
can run side by side. Point it at a stack with `web/.env.local` (the `CONSOLE_*` variables, with
`127.0.0.1:8090` for the engine; Batteries and the signer are not published to the host, so a dev
console against compose reads them as unreachable unless you add a port mapping locally).

## Operating the stack

See [deploy/README.md](../deploy/README.md): images, first run, start and stop, logs, resets.
