# Railway preview

The preview copy of this console. It runs in the Railway project `builder-engine`, environment
`preview`, region `us-west2`, beside the preview engine. It signs in through Auth0. Production
of the engine is not part of this setup.

The enterprise desk points at the same public engine (`https://engine-preview.up.railway.app`) with
an `lpk_` key. This console uses the private addresses on `*.railway.internal`, because Batteries
has no public address.

## What was decided

- Auth0 is the issuer. No identity service runs on Railway.
- The engine default stays strict RFC 9068 (`typ: at+jwt`). The Auth0 API uses token dialect
  `rfc9068_profile_authz`, so access tokens are `typ: at+jwt` with `client_id` and `jti`. The preview
  engine does not set `LPB_JWT_TOKEN_TYPES`. ID tokens stay `typ: JWT` and use the client id as `aud`,
  so the engine refuses them.
- The engine reads permissions from Auth0's RBAC list (`LPB_JWT_SCOPE_CLAIM=permissions`), not from
  the scopes the client asked for. A builder who opens Operator can request `livepeer:admin` and
  still not receive it.
- `CONSOLE_OIDC_OFFLINE_ACCESS=true` asks Auth0 for `offline_access`, which is how Auth0 returns a
  refresh token. The local Keycloak stack leaves this unset.

## Auth0

One API:

| Setting | Value |
| --- | --- |
| Identifier (`aud`) | `https://engine-preview.up.railway.app` |
| Signing | RS256 |
| Access-token lifetime | 900 seconds (the engine refuses a token longer than an hour) |
| RBAC | on, permissions included in the access token |
| Offline access | allowed |
| Permissions | `livepeer:admin`, `livepeer:read`, `discover`, `jobs.run`, `jobs.read`, `costs.read`, `events.read` |

| Role | Permissions |
| --- | --- |
| `operator` | `livepeer:admin` |
| `builder` | `discover`, `jobs.run`, `jobs.read`, `costs.read`, `events.read` |

A person who signs in through Google has neither role until they are assigned one. The console then
refuses the area: Operator because the token has no `livepeer:admin`, Builder because it has no
`jobs.run`. Assigning the role is the fix. [deploy/auth0/tenant.example.json](../auth0/tenant.example.json)
is the template for the API, the two roles, a placeholder assignment of `operator`, and the two
client grants. It is not a dump of this tenant.

Provision an actor, when `CONSOLE_AUTH0_DOMAIN` and the management client are set, creates that
Auth0 user first (subject name `carol` becomes user id `auth0|carol`, the builder role, a one-time
password) and then the engine allocation. The actor id is that user id, so a later sign-in’s `sub`
is the actor Batteries was funded for.

**Add an operator** creates the same kind of database user and assigns the operator role, then stops.
There is no allocation and no engine call. The role is stored on `auth0|<subject>` only. A Google
login for the same email is `google-oauth2|<id>`, a different user, and the roles API is not called
for it. Leave Auth0 account linking off on this tenant: a link would let the Google user inherit the
database user's roles. Set `CONSOLE_AUTH0_OPERATOR_ROLE_ID` to the operator role's id. The
`builder-console` application must have the database connection enabled, or the one-time password
cannot be used to sign in.

`operator` holds the operator role. `alice`, `bob`, and `carol` hold the builder role. The Auth0
`sub` is the engine actor id.

Two applications:

- `builder-console`, a regular web application. Authorization code with PKCE, refresh-token
  rotation, and client credentials. Callback `https://console-preview-c2c1.up.railway.app/auth/callback`.
  The machine grant is only `livepeer:read`, so the same client is the background reader.

The tenant is `dev-h7c0e2nbl030lmwn.us.auth0.com`. `iss` is
`https://dev-h7c0e2nbl030lmwn.us.auth0.com/`, including the trailing slash. That string is
`LPB_JWT_ISSUER` and `CONSOLE_OIDC_ISSUER`.

`builder-console` (`gLURhCGKNWriVROUls9Y9HT6kQ0Y8Vcm`) is the only application. Auth0 separates its
two grants by subject:

| Subject | Scopes |
| --- | --- |
| user | every permission a signed-in person may be given, including `livepeer:admin` |
| client | `livepeer:read` only |

Client credentials cannot obtain `livepeer:admin`. The console's reader uses the same client id and
asks only for `livepeer:read`.

## Console service

Dockerfile `deploy/console/Dockerfile`, context the repository root. The install step does not
use a BuildKit cache mount: Railway's Dockerfile frontend rejects one. Port 3000. Healthcheck
`/livez`. Region `us-west2`. Railway sets `PORT` (currently 8080); the public domain targets that
port. Public URL `https://console-preview-c2c1.up.railway.app`.

| Variable | Value |
| --- | --- |
| `CONSOLE_AUTH` | `oidc` |
| `CONSOLE_OIDC_OFFLINE_ACCESS` | `true` |
| `CONSOLE_OIDC_AUDIENCE` | `https://engine-preview.up.railway.app` |
| `CONSOLE_ENGINE_URL` | `http://engine.railway.internal:8080` |
| `CONSOLE_BATTERIES_URL` | `http://batteries.railway.internal:8081` |
| `CONSOLE_BATTERIES_TOKEN` | the preview Batteries `console-reader` token |
| `CONSOLE_DISCOVERY_URL` | `http://discovery.railway.internal:8939/discovery` |
| `CONSOLE_SIGNER_URL` | `http://signer.railway.internal:8937` |
| `CONSOLE_SIGNER_METRICS_URL` | `http://signer.railway.internal:8939` |
| `CONSOLE_OIDC_ISSUER` | Auth0 `iss`, exactly |
| `CONSOLE_OIDC_REDIRECT_URL` | `https://<console-domain>/auth/callback` |
| `CONSOLE_OIDC_CLIENT_ID`, `CONSOLE_OIDC_CLIENT_SECRET` | the `builder-console` application |
| `CONSOLE_READER_CLIENT_ID`, `CONSOLE_READER_CLIENT_SECRET` | the same `builder-console` client; client credentials receive only `livepeer:read` |
| `CONSOLE_READER_SCOPE` | `livepeer:read` |
| `CONSOLE_SESSION_SECRET` | 32 or more characters |

The signer still binds metrics to loopback (gap G5). The Railway signer image relays `[::1]:8938` to
`[::]:8939` on the private network, which is `CONSOLE_SIGNER_METRICS_URL`. That port is not public.

Sign-out returns to `/operator` or `/builder`. Auth0 allows only the logout URLs listed on
`builder-console`, so those two paths must be there, not only the site root.

## Preview engine

Set on the preview environment only. The engine service is shared with production.

| Variable | Value |
| --- | --- |
| `LPB_AUTH` | `jwt,api_keys` |
| `LPB_JWT_ISSUER` | Auth0 `iss`, exactly |
| `LPB_JWT_AUDIENCE` | `https://engine-preview.up.railway.app` |
| `LPB_JWT_SCOPE_CLAIM` | `permissions` |
| `LPB_JWT_ADMIN_SCOPE` | `livepeer:admin` |
| `LPB_JWT_ADMIN_READ_SCOPE` | `livepeer:read` |
| `LPB_JWT_NAME_CLAIM` | `nickname` |

Do not set `LPB_JWT_ALLOW_HTTP`. API keys stay on, so the enterprise desk's `lpk_` key still works.

## Batteries reader

Preview Batteries gets `CONSOLE_READER_TOKEN`, a 64-character hex secret. The entrypoint in
livepeer-builder-core adds a `console-reader` credential whose allow list is read permissions
only. Production leaves the variable unset and does not gain that credential. Redeploy preview
Batteries after setting it. Point `CONSOLE_BATTERIES_TOKEN` at the same value. Do not use the
operator token.

## Checklist

1. Confirm Auth0 discovery: `iss` and `jwks_uri` are `https`.
2. Deploy this console and set the variables above, including the callback URL Auth0 has.
3. Set `CONSOLE_READER_TOKEN` on preview Batteries and redeploy that service only.
4. Set the preview engine variables and wait for `/livez`.
5. Sign in as `operator` and as `alice`. Do not provision or run a job: the preview signer spends real money.
