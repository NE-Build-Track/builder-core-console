# Deploy

The builder stack and its console, in Docker Compose. Same components, pins, config and secrets as
ChatLPT's `deploy/`, plus the stock builder-core engine as its own service and the console. This is
the Build Track's M3 dev stack ([m3-environment.md](../docs/references/m3-environment.md)).
Reference: [docs/references/payment-stack.md](../docs/references/payment-stack.md).

| Service | Image | Reachable at |
| --- | --- | --- |
| `clearinghouse` | `builder-console/clearinghouse:ca09e47` | compose network: `:8081` management API, `:8937` signer, `:8939` signer metrics |
| `signer` | `builder-console/node:406b248` | shares the clearinghouse namespace |
| `signer-metrics` | `alpine/socat:1.8.0.3` | relays the signer's loopback metrics to `:8939` |
| `engine` | `builder-console/engine:a6ed9b5` | `127.0.0.1:8090` (Swagger at `/docs`) |
| `discovery` | `builder-console/engine:a6ed9b5` running `lpb discovery` (static list `config/orchestrators.txt`) | `discovery:8939` on the compose network only |
| `console` | `builder-console/console:local` | `127.0.0.1:3060` |

Testing sign-in through an identity provider instead of keys: [keycloak/README.md](keycloak/README.md), a
separate compose project with Keycloak, a JWT-only engine and the console (`CONSOLE_AUTH=oidc`).

## Secrets

Either reuse ChatLPT's values (D3):

```sh
mkdir -m 700 deploy/secrets
cp -p ../chatlpt-sample-enterprise-app/deploy/secrets/* deploy/secrets/
python3 deploy/init-secrets.py      # adds the read-only console-reader; lets the grant desk fund grants
```

or start fresh with `python3 deploy/init-secrets.py` on an empty `deploy/secrets/`, then add
`keystore.json`, `keystore-password` and `rpc-url` (mode 0600). No orchestrator certificates are
pinned: the signer only signs, and the discovery service leaves out orchestrators with untrusted TLS.
The orchestrators to discover are in `deploy/config/orchestrators.txt`.

## First run

```sh
cp deploy/.env.example deploy/.env && chmod 600 deploy/.env
make images            # all five images; Batteries, the signer and the engine build from GitHub at their pins
deploy/first-run.sh    # fills LPB_* tokens, CONSOLE_BATTERIES_TOKEN, LPB_SECRET_KEY, the engine admin key and CONSOLE_SESSION_SECRET
```

`first-run.sh` keeps values that are already set and never starts the signer. The engine admin key is
printed once by the engine and written only to `deploy/.env`.

## Operating

```sh
make up        # stop ChatLPT's stack first: one signer per payer account
make logs
make down      # keeps volumes; `docker compose -f deploy/compose.yaml down -v` deletes all stack state
```

**Upgrading from engine `0dbfe6e`:** start over with `down -v`. That engine (builder-core #53) numbered its
migrations `0006` (actor label) and `0007` (sightings). In builder-core `releases/m3`, and in #69, `0006` is
the payment intent, and the actor migrations are `0007` and `0008`. An `engine-data` volume at #53's `0007`
would skip `0006` and fail. Reset `paid-state` with it, so the ledger never names allocations the new
engine has no record of.

The console's pages only read (D1); its Operator actions change the stack through the engine (D15), and
the engine on 127.0.0.1:8090 takes the same calls by curl or Swagger. Run `python3 deploy/init-secrets.py`
once on secrets copied from ChatLPT so the grant desk can fund the grants it creates (then restart
clearinghouse). A funded grant can also be created with the CLI, as ChatLPT's `first-run.sh` does:

```sh
docker compose -f deploy/compose.yaml exec -T clearinghouse \
  clearinghouse --db-path /data/clearinghouse.db grant create --name Pilot --sponsor Pilot --amount-usd 5 --status active
```

Then provision an actor from that grant and issue its key through the engine:

```sh
TOKEN=$(grep ^CONSOLE_ENGINE_ADMIN_TOKEN= deploy/.env | cut -d= -f2)
PROVISION_REF=$(uuidgen); KEY_REF=$(uuidgen)  # one per command; send the same one again to repeat it safely
curl -s -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"amount":{"amount":"1","currency":"USD"},"label":"customer 42","grant_id":"<grant id>","operation_ref":"'"$PROVISION_REF"'"}' \
  http://127.0.0.1:8090/v1/admin/applications/default/actors/customer-42/allocation
curl -s -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"actor_id":"customer-42","application_id":"default","label":"customer 42","operation_ref":"'"$KEY_REF"'"}' http://127.0.0.1:8090/v1/admin/keys
```

Every admin command that moves money or creates a key (provision, fund an allocation or a grant, create a
grant, rotate a payment key, issue or rotate an access key) requires an `operation_ref`, and answers 422
without one (builder-core D57). Sending the same reference with the same body again applies nothing twice:
the engine answers from its record with `Idempotent-Replayed: true`. A repeated key issue or rotation answers
`201` with `"token": null`, because the engine keeps only the token's hash; if nobody copied the token, rotate
the key under a new reference. The same reference with a different body is `409` `operation_conflict`; one
whose first request is still running is `409` `operation_in_progress` with `Retry-After`.

Swagger at <http://127.0.0.1:8090/docs> does the same interactively: **Authorize** takes the token
(`lpk_…`) and sends it as `Authorization: Bearer`. The engine declares the scheme when its API keys are on, as on this stack.

### Demo traffic

`scripts/demo-traffic.py --yes` does all of the above for a fixed scenario: two grants, five actors in two
applications with their own allocations and keys, and a batch of short paid jobs (chat and embeddings), plus
one deliberately rejected request. **It spends real money** through the signer (a few tenths of a cent per
batch). Re-running reuses the grants, allocations and keys (kept in `.local/demo-keys.json`) and adds a batch.
See [the 20 October run](../docs/references/evidence/2026-10-20-demo-traffic.md).

To run Batteries, the engine and the console without the signer (safe while ChatLPT runs; discovery
and the signer checks read as down):

```sh
docker compose -f deploy/compose.yaml up -d --no-deps clearinghouse engine console
```
