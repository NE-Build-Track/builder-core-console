# Data sources

Every upstream route the console reads. `web/src/domain/catalog.ts` holds the same list, and
`web/tests/structure/docs.test.ts` fails when the adapters, the catalog and this page disagree.
Every route is a GET (decision D1).

## Engine

The stock builder-core REST service at `CONSOLE_ENGINE_URL` (`http://engine:8080` in compose), read
with `CONSOLE_ENGINE_ADMIN_TOKEN`, an `lpk_` admin key from `lpb bootstrap-admin`. Types come from
`openapi/engine.openapi.json`, the spec of the pinned engine (D12).

| Route | Page | Notes |
| --- | --- | --- |
| `GET /readyz` | Health, Network, footer | No auth. Answers 503 with the same `EngineHealth` body when not ready; the console reads that as an unready engine, not a failure. Gives discovery freshness, cost-sync time and error, running jobs, allocation mode, version. |
| `GET /v1/offerings` | Network | Apps on offer, runner counts, rate range. |
| `GET /v1/runners` | Network | Per app (`?app=`): runner URL, orchestrator, capacity, GPU, price, version. |
| `GET /v1/admin/grants` | Money | The engine's view of Batteries grants (through its grant-desk credential). |
| `GET /v1/admin/keys` | Users | Every access key: actor, application, kind, permissions, revoked. Actors are derived from this (gap G2). |
| `GET /v1/allowance` | Users | `?actor_id=`: the actor's allocation, granted, spent, available. Scoped to the admin key's application (gap G9). |
| `GET /v1/costs/summary` | Users, Usage | Spend by cost class over a window, optionally per actor (gap G9). |
| `GET /v1/costs/projections` | Jobs | The 25 newest job costs (gap G3). |
| `GET /v1/admin/reconciliation` | Health, Users | Batteries spend against engine attribution, per application or actor: `balanced`, `unattributed`. Per application answers 404 in per_actor mode (gap G10). |
| `GET /v1/jobs/{job_id}` | Jobs | Any job by id, with attempts and signed sessions. There is no admin job list (gap G1). |
| `GET /v1/jobs/{job_id}/cost` | Jobs | The job's cost by attempt and cost class. |

### With a signed-in key (Operator actions and Builder, D15–D18)

These calls use the key the person signed in with, not the console's admin key, and are never cached.
The Builder also reads `GET /v1/offerings`, `GET /v1/runners`, `GET /v1/allowance`, `GET /v1/costs/summary`
and `GET /v1/jobs/{job_id}` (and `/cost`) with its actor key; the Operator page reads `GET /v1/admin/grants`,
`GET /v1/admin/keys` and each actor's `GET /v1/allowance` with the admin key.

| Route | Area | Notes |
| --- | --- | --- |
| `GET /v1/jobs` | Builder, sign-in | The key's own jobs. At sign-in it shows the key works; the newest job names the actor (gap G13). |
| `POST /v1/jobs` | Builder | Runs a job. `?stream=true` for chat; the response streams through the console unchanged, with `Livepeer-Job-Id`. |
| `POST /v1/admin/grants` | Operator | Create a grant with an amount. Needs the grant desk to hold `grants.fund` (deploy/init-secrets.py). Returns only the id (gap G12). |
| `POST /v1/admin/grant/fund` | Operator | Add to a grant. Takes an operation reference; a repeat applies once. |
| `POST /v1/admin/applications/{application_id}/actors/{actor_id}/allocation` | Operator | Provision an actor with an allocation drawn from a grant. No operation reference yet (ISS-11). |
| `POST /v1/admin/applications/{application_id}/actors/{actor_id}/allocation/fund` | Operator | Add to an allocation. Takes an operation reference. |
| `POST /v1/admin/applications/{application_id}/actors/{actor_id}/allocation/status` | Operator | `active`, `paused` or `exhausted`. |
| `POST /v1/admin/applications/{application_id}/actors/{actor_id}/allocation/rotate-key` | Operator | Replace the allocation's gateway key; the engine keeps the new one. Takes an operation reference. |
| `POST /v1/admin/applications/{application_id}/actors/{actor_id}/allocation/revoke` | Operator | Stop the allocation for good. |
| `POST /v1/admin/keys` | Operator | Issue an access key. The token comes back once and is shown once. No operation reference yet (ISS-11). |
| `GET /v1/admin/actors` | Operator | The provisioned actors, with label, status and allocation (builder-core #69, D46). Under `CONSOLE_AUTH=oidc` it is also the operator's sign-in check, and the background reads call it with the read-only `console-reader` token (an auditor). |
| `GET /v1/admin/keys/{key_id}` | Operator | Inspect one key just before the review of a rotation or revocation: owner, kind, permissions, label, created and revoked times. Never the token or its hash (builder-core ISS-08, D44). |
| `POST /v1/admin/keys/{key_id}/rotate` | Operator | Rotate an access key: a new key with the same owner, kind and permissions, shown once; the old one answers 401 at once. An optional body `{"label": ...}` renames it. A repeat finds the old key revoked and answers 400, so it never applies twice. |
| `POST /v1/admin/keys/{key_id}/revoke` | Operator | Revoke an access key. |

## Batteries

The Clearinghouse Batteries management API at `CONSOLE_BATTERIES_URL` (`http://clearinghouse:8081`),
read with the `console-reader` credential (`*.read` only; `deploy/init-secrets.py`). Header:
`Livepeer-Clearinghouse-Token`. Lists are cursor-paged (`limit` ≤ 1000, `next_cursor`), oldest first,
with no time filter (gap G6). Shapes: `web/src/domain/batteries.ts`.

| Route | Page | Notes |
| --- | --- | --- |
| `GET /readyz` | Health | No auth. |
| `GET /v1/grants` | Money | `id, name, sponsor, status, currency, total_usd`. |
| `GET /v1/allocations` | Money, Usage | `allocated_usd, spent_usd, available_usd, status, grant_id`. |
| `GET /v1/api-keys` | Money | Gateway (`lpg_`) keys per allocation: prefix, last used, revoked. |
| `GET /v1/sessions` | Usage | Payment sessions: `app`, `orchestrator` (ticket recipient), allocation, key. Joins usage to app and orchestrator. |
| `GET /v1/usage` | Usage, Jobs | Every applied or quarantined `create_signed_ticket` event: `computed_fee_usd`, `computed_fee_eth`, `manifest_id`, `payment_session_id`. Jobs filters by `manifest_id`. |
| `GET /v1/ledger/report` | Money | Double-entry balances per account (`allocation_available`, `allocation_spent`, `grant_funding_source`, `grant_unallocated`). |
| `GET /v1/escrow/report` | Money | Payer deposit and reserve in wei, only with the on-chain listener (gap G7). |

Available but not yet read: `GET /v1/settlements` (empty without the on-chain listener) and
`GET /v1/escrow/activity`.

## Signer

The node remote signer. Two listeners:

- **Signing port** at `CONSOLE_SIGNER_URL` (`http://clearinghouse:8937`; the signer shares the
  clearinghouse network namespace). The console calls nothing here: the signer only signs (builder-core
  D43), and the console never calls a signing route.
- **Metrics listener** at `CONSOLE_SIGNER_METRICS_URL` (`http://clearinghouse:8939`). The signer binds
  it to loopback only, so the `signer-metrics` relay re-exposes it on the compose network (D10, gap G5).

| Route | Page | Notes |
| --- | --- | --- |
| `GET /readyz` | Health | 200 when chain access, a positive deposit and reserve, no scheduled withdrawal, a fresh price rate and a healthy outbox all hold; 503 with a reason otherwise. |
| `GET /metrics` | Health | Prometheus text: `livepeer_signer_up`, `livepeer_signer_kafka_outbox_healthy`, `_pending_events`, `_pending_bytes`, `_oldest_event_age_seconds`, `_publish_errors_total`, `_enqueue_errors_total`, `_storage_errors_total`. |

## Discovery

The discovery service, `lpb discovery` from the pinned builder-core, at `CONSOLE_DISCOVERY_URL`
(`http://discovery:8939`). It lists orchestrators (here a static list, `deploy/config/orchestrators.txt`),
probes each one's `/discovery` over trusted TLS, and serves the merged inventory. The engine reads the
same inventory through `LPB_DISCOVERY_URL`, so the Network page shows exactly what the engine can buy.

| Route | Page | Notes |
| --- | --- | --- |
| `GET /discovery` | Network, nav count | livepeer-node's inventory: one entry per serving orchestrator, `address` and `runners` (capacity, price, GPU). No `last_seen`: the service serves only what answered within its retention window. |
