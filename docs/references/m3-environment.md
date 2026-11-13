# The M3 funded configuration (ISS-13)

The environment the M3 journey runs in, until a deployment on real infrastructure exists: this
repository's stack, the M3 dev stack ([decision record](https://github.com/Cloud-SPE/Network-Engineering-SPE/blob/main/docs/decisions/2026-10-21-m3-reference-app-and-scope.md),
decision 5). It is builder-core's engine, Clearinghouse Batteries and the node remote signer at the
commits in [payment-stack.md](payment-stack.md), plus the console, run with Docker Compose on one
machine. Recorded 21 October 2026; refreshed 2 November for the engine at `1514212` (builder-core D57–D62, merged),
and 13 November for `v0.2.0` (`28ae6a9`, D63: discovery is livepeer/node's `livepeer-discovery`).

## Endpoints

| What | Where | Who uses it |
| --- | --- | --- |
| Console | `http://127.0.0.1:3060` | Operator and builder, in a browser |
| Engine REST API | `http://127.0.0.1:8090` (Swagger at `/docs`); `http://engine:8080` inside compose | The console; a builder with curl |
| Batteries management API | `http://clearinghouse:8081`, compose network only | The engine (accounting and provisioning), the console (reads) |
| Signer | `http://clearinghouse:8937`, compose network only | The engine (payment only) |
| Discovery | `http://discovery:8939/discovery`, compose network only | The engine (`LPB_DISCOVERY_URL`), the console's Network page |
| Orchestrators | public, on discovery's list | The engine, paid per job |

The engine's host port is 8090 unless `ENGINE_PORT` in `deploy/.env` moves it, for when 8090 is taken on the
host; compose publishes it there, and the scripts (`scripts/demo-traffic.py`, the live checks) read it from
the same file. Restarting `clearinghouse` needs the signer recreated with it (`make restart-payments`; see
[deploy/README.md](../../deploy/README.md#operating)).

## Credentials and who holds them

| Credential | Scope | Holder |
| --- | --- | --- |
| Engine admin key (`lpk_`) | Everything on the engine | The operator; one is in `deploy/.env` (`CONSOLE_ENGINE_ADMIN_TOKEN`), never given to the console |
| Engine auditor key (`lpk_`) | Read only, every actor of one application | The console's reads (`CONSOLE_ENGINE_READER_TOKEN`, from `first-run.sh`) |
| Engine actor key (`lpk_`) | One actor: discover, run, read its own jobs and costs | The builder. Issued in Operator actions, shown once |
| Batteries `builder-engine` | Fund grants, create and fund allocations, gateway keys, usage | The engine (`LPB_BATTERIES_TOKEN`) |
| Batteries `grant-desk` | Create, read and fund grants | The engine (`LPB_BATTERIES_OPERATOR_TOKEN`) |
| Batteries `console-reader` | Read only | The console's pages |
| Gateway key (`lpg_`) | Pay from one allocation | The engine's secret store; never shown to anyone |
| Payer keystore, RPC URL | Sign tickets on Arbitrum One | The signer, from `deploy/secrets/` |
| `CONSOLE_SESSION_SECRET` | Seals console sign-ins | The console |

The builder holds one engine key and nothing else: no wallet, no payment key, no Batteries credential.

## Money: who funds what

| Layer | What it is | Who funds it, and how |
| --- | --- | --- |
| **Payer deposit and reserve** | ETH in the TicketBroker on Arbitrum One. The only real money: every ticket an orchestrator redeems is paid from it | The operator (Cloud SPE), on chain, outside the console. Shared with ChatLPT, so one signer runs at a time |
| **Grant** | A budget in the Batteries ledger, in USD | The operator, in Operator actions (create a grant; fund a grant) |
| **Allocation** | One actor's share of a grant; spending stops when it runs out | The operator, in Operator actions (provision an actor; fund the allocation) |
| **Job** | Tickets signed per job and applied to the actor's allocation; the engine attributes each to its job | The builder, by running it. Network cost is wholesale, in USD from Batteries |

Grants and allocations are accounting that limits spend; the deposit is what pays. A grant larger than
the deposit can still be created, so the operator checks the signer's `/readyz` (the Health page) before
a funded run.

## Set up from nothing

1. Follow [deploy/README.md](../../deploy/README.md): secrets (copied from ChatLPT or fresh), then
   `python3 deploy/init-secrets.py`, `make images`, `deploy/first-run.sh`.
2. Stop ChatLPT's stack if it runs; then `make up`. The Health page should read Operational, with the
   signer ready to pay and discovery fresh.
3. In **Operator actions**, sign in with the admin key from `deploy/.env`: create a grant, issue an actor
   key (copy it), provision that actor from the grant, and take the key to the **Builder**.

## Accounting access

The engine reads Batteries usage every 30 seconds and attributes each ticket to its job and attempt; a
job's cost moves from `pending` to `observed` within about a minute. The console's pages read Batteries
directly with `console-reader` and show where the two agree (Health, Users). The builder sees only their
own allowance and wholesale cost, through the engine.

## What the engine promises at this pin (D57–D63)

The engine is builder-core `28ae6a9`, tag `v0.2.0`: `releases/m3` with PRs #78–#83 and #77 merged (`1514212`), then
the discovery change (D63), stored-text limits (#103) and two fixes (#79, #102). Its REST walkthrough is builder-core's
[`docs/guides/rest-builder.md`](https://github.com/NE-Build-Track/livepeer-builder-core/blob/28ae6a953ba993eaa2839a97d53ed3f7f6101bca/docs/guides/rest-builder.md);
every operation the journey uses, and where the console sends it, is in
[m3-rest-operations.md](m3-rest-operations.md) (ISS-20).

| Area | Behaviour | Decision |
| --- | --- | --- |
| Operation references | Required (422 without) on create grant, fund grant, provision, fund allocation, rotate payment key, issue key and rotate key; a repeat answers from the engine's record (`Idempotent-Replayed: true`), another body under the same reference is 409 `operation_conflict`. The console makes one per dialog | D57 |
| Repeated revokes | Set status, revoke allocation and revoke key take no reference: a repeat answers as the first did (revoke allocation 200 with the revoked actor, revoke key 204), so a retry after a lost answer is not an error. An actor or key that never existed is still 404 or 400 | D61 |
| Payment failures | `Failure.reason` on a payment failure: `not_authorized` (403; an inactive grant or allocation, paused included, or an invalid or revoked payment key), `allowance_exhausted` (402; the operator funds it), `signer_unavailable` (503, `Retry-After: 10`), `signer_unknown` (503, the job `uncertain`: it may have charged). Messages are the engine's own; the signer's text stays in the engine log. The console shows each with builder-core's "what it means / what to do" | D58 |
| Request size | A `/v1/` request body over 16 MiB (`LPB_HTTP_MAX_REQUEST_BYTES`) is 413 `request_too_large` with `limit_bytes`, before the key is checked | D59 |
| Results | Returned inline, once, not kept; `GET /v1/jobs/{id}/result` is 501 until M4. A provider-hosted URL (fal, for FLUX schnell) expires on the provider's schedule while the job stays succeeded and its cost stands, so the console's Image example sends `sync_mode: true` and gets the picture inline | D59 |
| History | `GET /v1/jobs` pages newest first with `before` (an ISO time with its offset; without one, 422) | D59 |
| Cost per app | `CostSummary.by_app` is `{app: {cost_class: Fees}}`: final classes and `pending` never summed, and for every class the apps add up to `by_class` | D60 |
| Events feed | Held for M3: `GET /v1/events` is 501 with `milestone: "held"` (gap G4) | D60 |
| Discovery | Read only from `LPB_DISCOVERY_URL`, which is required: livepeer/node's `/discovery` document. A runner carries `price_info` as advertised and has no `runner_id`, `rate` or `rate_error`; `orchestrator_url` is absent when the advertised address is on another origin than the runner URL. Whether a price can be paid is the engine's call at payment time | D63 |
| Stored text | An id, label or reference over 200 characters, or holding a NUL, is 422 before anything is applied. The console's forms keep within the length (ids 128 from a fixed character set, labels 120, operation references and the job's app 200); a label holding a NUL reaches the engine, which refuses it, and the console shows the 422 | #103 |

No migration since `0011` (`1514212`), so the stack's volumes carry over. The one setting now required is
`LPB_DISCOVERY_URL`, which compose sets; like `LPB_SIGNER_URL` it may not carry userinfo, a query or a
fragment, which this stack's never does.

## Limits of this configuration

- One machine, loopback only; not reachable by other people without a proxy (see [SECURITY.md](../SECURITY.md)).
- Shares its payer with ChatLPT; one stack signs at a time.
- Public orchestrators on a fixed list (`deploy/config/discovery.toml`), served by livepeer/node's `livepeer-discovery`; orchestrators with untrusted TLS are left out (builder-core D43, T12 resolved), and so is every runner with no `observed_at` stamp, which leaves out orchestrators on node v1.0.2 (D63).
- The second payment configuration (`per_application`) is M4 (ISS-31).
