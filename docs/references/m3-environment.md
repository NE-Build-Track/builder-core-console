# The M3 funded configuration (ISS-13)

The environment the M3 journey runs in, until a deployment on real infrastructure exists: this
repository's stack, the M3 dev stack ([decision record](https://github.com/Cloud-SPE/Network-Engineering-SPE/blob/main/docs/decisions/2026-10-21-m3-reference-app-and-scope.md),
decision 5). It is builder-core's engine, Clearinghouse Batteries and the node remote signer at the
commits in [payment-stack.md](payment-stack.md), plus the console, run with Docker Compose on one
machine. Recorded 21 October 2026.

## Endpoints

| What | Where | Who uses it |
| --- | --- | --- |
| Console | `http://127.0.0.1:3060` | Operator and builder, in a browser |
| Engine REST API | `http://127.0.0.1:8090` (Swagger at `/docs`); `http://engine:8080` inside compose | The console; a builder with curl |
| Batteries management API | `http://clearinghouse:8081`, compose network only | The engine (accounting and provisioning), the console (reads) |
| Signer | `http://clearinghouse:8937`, compose network only | The engine (payment and discovery) |
| Orchestrators | public, on the engine's list | The engine, paid per job |

## Credentials and who holds them

| Credential | Scope | Holder |
| --- | --- | --- |
| Engine admin key (`lpk_`) | Everything on the engine | The operator; one is in `deploy/.env` for the console's reads |
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

## Limits of this configuration

- One machine, loopback only; not reachable by other people without a proxy (see [SECURITY.md](../SECURITY.md)).
- Shares its payer with ChatLPT; one stack signs at a time.
- Public orchestrators on a fixed list, with pinned certificates (builder-core T12).
- The second payment configuration (`per_application`) is M4 (ISS-31).
