# Keycloak test stack

Sign in to the console through an identity provider (decision D21) against an engine that accepts only
JWTs (builder-core PR #50, `LPB_AUTH=jwt`, and PR #53: the actor list and the read-only auditor). It is
a separate compose project from `deploy/compose.yaml` and spends nothing: there is no signer and no
Batteries, so grants, provisioning and paid jobs answer errors here.

| Service | Reached at | What it is |
| --- | --- | --- |
| `keycloak` | http://keycloak.localhost:8180 (admin console at `/admin`) | Keycloak 26.8.1, realm `livepeer` from `realm-livepeer.json` |
| `engine` | http://127.0.0.1:8091 (Swagger at `/docs`) | builder-core `4041ffe`, `LPB_AUTH=jwt`, strict RFC 9068 tokens |
| `discovery` | compose network only | `lpb discovery` over `../config/orchestrators.txt` |
| `console` | **http://127.0.0.1:3061** | the console with `CONSOLE_AUTH=oidc` |

Open the console at `127.0.0.1:3061` exactly: it is the address registered as the client's redirect URL.
`keycloak.localhost` needs no hosts entry: browsers resolve `*.localhost` to loopback, and inside the
stack it is a network alias, so the issuer is one URL everywhere.

## Run

```sh
deploy/keycloak/first-run.sh                      # writes deploy/keycloak/.env once (secrets, demo password)
docker compose -f deploy/keycloak/compose.yaml up -d --build
grep DEMO_PASSWORD deploy/keycloak/.env           # the demo users' password
docker compose -f deploy/keycloak/compose.yaml down        # stop; add -v to forget the engine's database
```

## People and clients (realm `livepeer`)

| Who | Realm role | Gets | In the console |
| --- | --- | --- | --- |
| `operator` | `operator` | `livepeer:admin` (engine admin) | Operator actions |
| `alice`, `bob` | `builder` | `discover jobs.run jobs.read costs.read events.read` | Builder; the actor is their `sub` |
| `console-reader` (service account) | `reader` | `livepeer:read` (engine auditor) | the background reads |

- **Role-gated scopes.** Each scope is linked to a role, and Keycloak grants it only to users who hold
  that role. alice asking for `livepeer:admin` does not get it, so the console refuses her Operator
  sign-in.
- **Strict tokens.** Both clients turn on "Use at+jwt as access token header type" (Keycloak 26.2+) and
  carry a `client_id` claim, so access tokens pass the engine's strict RFC 9068 check (builder-core D47)
  without its opt-out.
- **Audience.** The `engine-audience` scope puts the engine's resource identifier,
  `https://engine.builder.local`, in `aud`. ID tokens have no such audience and say `typ: JWT`, so the
  engine refuses them.
- **Lifetimes.** Access tokens live 5 minutes, and the console refreshes them a minute early. Refresh
  tokens rotate, and the single sign-on session lasts 8 hours.

`LPB_JWT_ALLOW_HTTP` and `CONSOLE_OIDC_ALLOW_HTTP` are on only because this Keycloak serves http; never
set them in a deployment.
