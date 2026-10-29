# Keycloak test stack

Sign in to the console through an identity provider (decision D21) against an engine that accepts only
JWTs (builder-core PR #50, `LPB_AUTH=jwt`, and PR #69: the actor list and the read-only auditor). It is
a separate compose project from `deploy/compose.yaml`, and it is paid. Batteries and the signer run
exactly as there, with the same payer and credentials (`deploy/secrets`, and the tokens `first-run.sh`
copies from `deploy/.env`), but on this stack's own ledger (`builder-console-keycloak_paid-state`): its
grants and actors start empty and never mix with the main stack's. Create a grant in Operator actions first.

To start over, `down -v` removes this stack's ledger and engine database; Keycloak's users come back from
the realm file.

**Upgrading from engine `0dbfe6e`:** start over with `down -v`. That engine (builder-core #53) numbered its
migrations `0006` (actor label) and `0007` (sightings). In builder-core `releases/m3`, and in #69, `0006` is
the payment intent, and the actor migrations are `0007` and `0008`. An `engine-data` volume at #53's `0007`
would skip `0006` and fail. Reset `paid-state` with it, so the ledger never names allocations the new
engine has no record of.

**One signer per payer.** Stop `deploy/compose.yaml`, ChatLPT and inference-gateway before
`up`: they all sign for the same wallet.

| Service | Reached at | What it is |
| --- | --- | --- |
| `clearinghouse`, `signer`, `signer-metrics` | compose network only | Batteries `ca09e47` and the node signer `406b248`, as in `deploy/compose.yaml` |
| `keycloak` | http://keycloak.localhost:8180 (admin console at `/admin`) | Keycloak 26.8.1, realm `livepeer` from `realm-livepeer.json` |
| `engine` | http://127.0.0.1:8091 (Swagger at `/docs`) | builder-core `a6ed9b5` (the merge of PR #76 on `releases/m3`: repeat-safe admin commands, D57), `LPB_AUTH=jwt`, strict RFC 9068 tokens |
| `discovery` | compose network only | `lpb discovery` over `../config/orchestrators.txt` |
| `console` | **http://127.0.0.1:3061** | the console with `CONSOLE_AUTH=oidc` |

Open the console at `127.0.0.1:3061` exactly: it is the address registered as the client's redirect URL.
`keycloak.localhost` needs no hosts entry: browsers resolve `*.localhost` to loopback, and inside the
stack it is a network alias, so the issuer is one URL everywhere.

## A paid run

1. Sign in to the Builder as a new person, for example `carol`. Her first sign-in registers her with the
   engine (builder-core D48); the page says she has no allocation yet.
2. Sign out, and sign in to Operator actions as `operator`. Carol is on the actor list by name, "not
   provisioned". Click Provision: her `sub` and name are filled in. Pick a grant with unallocated money
   (the Money page lists it) and an amount such as `0.05`.
3. Sign out, sign in to the Builder as `carol`, and run a job from the catalog. Its cost appears under
   My jobs and Usage, and on the Operator page as her allocation's spend.

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
| `alice`, `bob`, `carol` | `builder` | `discover jobs.run jobs.read costs.read events.read` | Builder; the actor is their `sub` |
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
- **Fixed user ids.** Each user's `id`, and so its token `sub` and engine actor, is pinned in the realm
  file. Keycloak's dev mode keeps nothing across a container re-creation and re-imports the realm, so
  without pinned ids an actor's allocation would no longer match its person.

  | User | `sub` (engine actor id) |
  | --- | --- |
  | operator | `b715dc36-0112-4e10-9ce9-7e235669a3bf` |
  | alice | `3c446b40-7123-45f1-bbdd-482f8025d1d5` |
  | bob | `14a5c7ce-7de4-44a0-a1fd-b5855d63116f` |
  | carol | `5b1d7e90-3c2a-4f8e-9d61-0a7c4e2f8b13` |

- **Lifetimes.** Access tokens live 5 minutes, and the console refreshes them a minute early. Refresh
  tokens rotate, and the single sign-on session lasts 8 hours.

`LPB_JWT_ALLOW_HTTP` and `CONSOLE_OIDC_ALLOW_HTTP` are on only because this Keycloak serves http; never
set them in a deployment.
