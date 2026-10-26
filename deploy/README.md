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
| `engine` | `builder-console/engine:d057935` | `127.0.0.1:8090` (Swagger at `/docs`) |
| `console` | `builder-console/console:local` | `127.0.0.1:3060` |

## Secrets

Either reuse ChatLPT's values (D3):

```sh
mkdir -m 700 deploy/secrets deploy/config/pinned-certs
cp -p ../chatlpt-sample-enterprise-app/deploy/secrets/* deploy/secrets/
cp -p ../chatlpt-sample-enterprise-app/deploy/config/pinned-certs/*.pem deploy/config/pinned-certs/
python3 deploy/init-secrets.py      # adds the read-only console-reader; lets the grant desk fund grants
```

or start fresh with `python3 deploy/init-secrets.py` on an empty `deploy/secrets/`, then add
`keystore.json`, `keystore-password` and `rpc-url` (mode 0600) and pin orchestrator certificates with
`python3 deploy/config/pin-orchestrator-certs.py`.

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
curl -s -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"amount":{"amount":"1","currency":"USD"},"label":"customer 42","grant_id":"<grant id>"}' \
  http://127.0.0.1:8090/v1/admin/applications/default/actors/customer-42/allocation
curl -s -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"actor_id":"customer-42","application_id":"default","label":"customer 42"}' http://127.0.0.1:8090/v1/admin/keys
```

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
