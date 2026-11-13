# Payment stack: Batteries, the signer and the engine

The same components, pins and configuration as ChatLPT's `deploy/` (its
`docs/references/payment-stack.md`), plus the stock engine as its own service (D2, D3).

| Service | Source | Pin |
| --- | --- | --- |
| `clearinghouse` | `livepeer/clearinghouse-batteries`, `examples/compose/Dockerfile` | `ca09e47c067682fb48c3f15425546fb6aa5b6659` |
| `signer` | `livepeer/node`, `docker/Dockerfile`, binary `livepeer-signer` | `406b248f6cb8728e6e7eba1809901f589060bc6b` (v1.0.2) |
| `engine` | `NE-Build-Track/livepeer-builder-core`, `deploy/dev-stack/engine/Dockerfile` | `28ae6a953ba993eaa2839a97d53ed3f7f6101bca` (tag `v0.2.0`, the M3 release, 11 November). Over `1514212` (2 November: D58–D62 and #90's call timings) it reads discovery only from livepeer/node's `/discovery` document at the required `LPB_DISCOVERY_URL`, and its `Runner` carries `price_info` as advertised, with no `runner_id`, `rate` or `rate_error` (D63); it refuses an id, label or reference over 200 characters or holding a NUL with 422 (#103); a malformed signer identity reply no longer burns the job's `operation_ref` (#79). No migration since `0011`, so the `engine-data` volume carries over |
| `discovery` | `livepeer/node`, `docker/Dockerfile`, binary `livepeer-discovery` | `f45d83fd68f73d195dffe8b45f6cac296d023c49` (main, 10 commits after v1.0.6: the commit builder-core v0.2.0 pins, and whose discovery document its reader is tested against). Static mode, the list in `deploy/config/discovery.toml` |
| `signer-metrics` | `alpine/socat:1.8.0.3` | relay only (D10) |
| `console` | this repository, `deploy/console/Dockerfile` | — |

`web/src/domain/pins.ts` holds the same four commits; `web/tests/structure/pins.test.ts` fails when
it, `deploy/compose.yaml` and this page disagree. To re-pin: change all three, copy the new engine's
`docs/generated/openapi.json` to `openapi/engine.openapi.json`, run `make gen-api`, then `make check`.

The signer stays at `406b248` (v1.0.2), the commit ChatLPT signs with, while builder-core v0.2.0's own
dev stack signs with `f45d83f` too (its D63 (5)). The engine reaches the signer through the same SDK pin
at both engine commits.

## Topology

The signer shares the clearinghouse container's network namespace, as in ChatLPT: the webhook
(`:8080`) and embedded Kafka (`:9092`) stay on loopback; the management API (`:8081`) and the signer
(`:8937`) are reachable on the compose network. The signer's metrics listener (`:8938`) can only bind
loopback, so `signer-metrics` joins the same namespace and relays it as `clearinghouse:8939`.

Published to the host, on 127.0.0.1 only: the console (`CONSOLE_PORT`, 3060) and the engine
(`ENGINE_PORT`, 8090), whose Swagger UI takes the same calls as the console's Operator actions (D15;
D13 is superseded).

## Secrets (git-ignored `deploy/secrets/`)

The same files ChatLPT uses: `keystore.json`, `keystore-password` (payer account), `rpc-url`
(Arbitrum One), and what `init-secrets.py` generates: `clearinghouse.toml`, `operator-token`,
`engine-token`, `grant-desk-token`, `webhook-url`, `webhook-headers`, `kafka-username`,
`kafka-password`. This stack adds one: **`console-reader-token`**, a Batteries credential limited to
`grants.read`, `allocations.read`, `api_keys.read`, `sessions.read`, `settlements.read`, `usage.read`,
`ledger.read` and `escrow.read`.

**Batteries' on-chain listener** reports the payer's TicketBroker deposit and reserve (Money, payer escrow).
`deploy/compose.yaml` turns it on from `deploy/.env`: `BATTERIES_ONCHAIN_LISTENER=true` and `PAYER_ADDRESS`
(`first-run.sh` reads it from `keystore.json`), with the signer's `rpc-url`. It opens with a `getSenderInfo`
snapshot at a recent block, so it needs no start block, then polls every 30 s (`config/clearinghouse.toml`).
ChatLPT's Batteries does not run it; two listeners on one payer only read.

`init-secrets.py` either creates all of them in an empty folder, or, when the folder already holds a
`clearinghouse.toml` (copied from ChatLPT to use the same values), appends only the reader and adds
`grants.fund` to this stack's grant desk, so a grant can be created with an amount through the engine
(see "Not a console gap: funded grants through the engine" in [gaps.md](gaps.md); ChatLPT's own Batteries is unchanged).

## Engine settings

The `LPB_*` variables ChatLPT uses, minus its `per_application` shared key: `LPB_ALLOCATION_MODE=per_actor`
(D9), `LPB_SIGNER_URL=http://clearinghouse:8937`, `LPB_BATTERIES_URL=http://clearinghouse:8081`,
`LPB_BATTERIES_TOKEN` (`engine-token`), `LPB_BATTERIES_OPERATOR_TOKEN` (`grant-desk-token`),
`LPB_SECRET_KEY`, `LPB_DEFAULT_CURRENCY=USD`. The database is SQLite on the `engine-data` volume.

## One signer per payer

ChatLPT and this stack sign with the same payer keystore. Run one signer at a time: stop ChatLPT's
stack (`docker compose -f deploy/compose.yaml down` in that repository) before `make up` here.
`deploy/first-run.sh` never starts the signer, so it is safe while ChatLPT runs.

## Prerequisites

A payer account with a funded TicketBroker deposit and reserve on Arbitrum One, and an RPC URL. The
signer's `/readyz` (shown on the Health page) fails when either is missing.
