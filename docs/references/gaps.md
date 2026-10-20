# Gaps

What the console cannot show yet, what would fix it, and who owns the fix. `web/src/domain/gaps.ts`
holds the same list (pages cite it next to the data it limits); `web/tests/structure/docs.test.ts`
fails when the two disagree. The console works within these today; nothing here blocks v1.

| Gap | Owner | Unlocks |
| --- | --- | --- |
| [G1](#g1-no-admin-job-list) | builder-core | A real Jobs page: throughput, failures by kind, per-actor and per-app job history. |
| [G2](#g2-no-list-of-provisioned-actors) | builder-core | One read for the Users page instead of one per actor; actors with allocations but no keys. |
| [G3](#g3-cost-projections-capped-at-25) | builder-core | Job cost history beyond the newest 25; cost trends per app. |
| [G4](#g4-no-engine-metrics-or-events) | builder-core | Job rates, latency and failure trends over time; live updates instead of polling. |
| [G5](#g5-signer-metrics-are-loopback-only) | signer | Drop the relay container. |
| [G6](#g6-usage-feed-has-no-time-filter) | batteries | Usage over a window without walking the whole history; no partial totals. |
| [G7](#g7-payer-deposit-and-reserve-not-shown) | this repository | Payer runway: deposit and reserve against the burn rate. |
| [G8](#g8-no-read-only-engine-credential) | builder-core | A console credential that cannot write even if the code tried. |
| [G9](#g9-admin-reads-are-scoped-to-one-application) | builder-core | Per-actor money across every application. |
| [G10](#g10-no-application-wide-reconciliation-in-per_actor-mode) | builder-core | One reconciliation read for the Health page instead of one per actor. |
| [G11](#g11-reconciliation-flags-normal-sync-lag-as-unbalanced) | builder-core | An engine flag that only goes false on real money gaps, so it can drive alerts. |

## G1: No admin job list

**Impact.** GET /v1/jobs returns only the caller's own jobs, even for an admin, so the console cannot list jobs across actors. It shows recent cost projections and looks jobs up by id instead.

**Fix.** An admin-scoped job list with filters (actor, app, state, time) and paging.

**Owner.** builder-core. **Unlocks:** A real Jobs page: throughput, failures by kind, per-actor and per-app job history.

## G2: No list of provisioned actors

**Impact.** The engine has no route that lists actor allocations, so the console derives actors from access keys and reads each actor's allowance one by one.

**Fix.** GET /v1/admin/actors returning ProvisionedActor rows.

**Owner.** builder-core. **Unlocks:** One read for the Users page instead of one per actor; actors with allocations but no keys.

## G3: Cost projections capped at 25

**Impact.** GET /v1/costs/projections returns at most the 25 newest projections and has no paging.

**Fix.** Cursor paging and a time window on /v1/costs/projections.

**Owner.** builder-core. **Unlocks:** Job cost history beyond the newest 25; cost trends per app.

## G4: No engine metrics or events

**Impact.** The engine has no /metrics (tech debt T4) and /v1/events answers 501 until M4, so job throughput and latency over time are not available.

**Fix.** Engine /metrics (job, discovery and cost-sync counters) and the events feed.

**Owner.** builder-core. **Unlocks:** Job rates, latency and failure trends over time; live updates instead of polling.

## G5: Signer metrics are loopback-only

**Impact.** The signer refuses to bind its metrics listener off loopback, so the console reads it through a relay container that shares the signer's network namespace.

**Fix.** Already worked around in deploy/compose.yaml (signer-metrics). An upstream option to bind a private address would remove the relay.

**Owner.** signer. **Unlocks:** Drop the relay container.

## G6: Usage feed has no time filter

**Impact.** Batteries /v1/usage pages oldest-first with no time filter, so usage over a window means walking the whole feed. The console stops at a row cap and marks totals as partial when it does.

**Fix.** A since/until filter (or newest-first order) on /v1/usage and /v1/sessions.

**Owner.** batteries. **Unlocks:** Usage over a window without walking the whole history; no partial totals.

## G7: Payer deposit and reserve not shown

**Impact.** The signer's /readyz says only ready or not. Deposit and reserve amounts appear in Batteries' escrow report only when its on-chain listener runs, which this stack (like ChatLPT's) does not enable.

**Fix.** Enable the Batteries on-chain listener with the payer address, or read TicketBroker directly.

**Owner.** this repository. **Unlocks:** Payer runway: deposit and reserve against the burn rate.

## G8: No read-only engine credential

**Impact.** An engine admin key can do everything; DefaultPolicy ignores permissions for admins. The console stays read-only only because its code makes GET requests alone (tests/structure/read-only.test.ts).

**Fix.** A read-only admin credential kind, or permissions that apply to admin keys.

**Owner.** builder-core. **Unlocks:** A console credential that cannot write even if the code tried.

## G9: Admin reads are scoped to one application

**Impact.** Allowance, cost summary and projections use the admin key's own application_id, so per-actor money shows only for CONSOLE_APPLICATION_ID. Reconciliation takes any application.

**Fix.** An application_id parameter on the admin reads.

**Owner.** builder-core. **Unlocks:** Per-actor money across every application.

## G10: No application-wide reconciliation in per_actor mode

**Impact.** GET /v1/admin/reconciliation without an actor answers 404 in per_actor mode, so the console reconciles each actor and sums the verdicts itself.

**Fix.** Reconcile an application across all its actor allocations in the engine.

**Owner.** builder-core. **Unlocks:** One reconciliation read for the Health page instead of one per actor.

## G11: Reconciliation flags normal sync lag as unbalanced

**Impact.** The engine's balanced flag is false whenever Batteries has charged tickets its 30-second cost sync has not read yet, which is all the time while paid jobs run. The console tells this apart (no unattributed rows and Batteries ahead means catching up), but the engine's own flag cannot be alerted on.

**Fix.** Reconcile only up to the last synced usage row, or report the unsynced amount separately from unattributed spend.

**Owner.** builder-core. **Unlocks:** An engine flag that only goes false on real money gaps, so it can drive alerts.
## Not a console gap: funded grants through the engine

With ChatLPT's credential layout (also builder-core's dev stack), `POST /v1/admin/grants` with a non-zero
amount fails with `provider HTTP 403`: the grant-desk credential has `grants.create` but not `grants.fund`,
and Batteries needs both for a funded grant. ChatLPT creates its grant with the Batteries CLI for the
same reason. This stack does the same ([deploy/README.md](../../deploy/README.md#operating)). Found
20 October 2026.
