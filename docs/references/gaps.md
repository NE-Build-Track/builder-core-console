# Gaps

What the console cannot show yet, what would fix it, and who owns the fix. `web/src/domain/gaps.ts`
holds the same list (pages cite it next to the data it limits); `web/tests/structure/docs.test.ts`
fails when the two disagree. The console works within these today; nothing here blocks v1.

| Gap | Owner | Unlocks |
| --- | --- | --- |
| [G1](#g1-the-jobs-page-lists-projections-not-jobs) | this repository | A real Jobs page: throughput, failures by kind, per-actor and per-app job history. |
| [G3](#g3-cost-projections-capped-at-25) | builder-core | Job cost history beyond the newest 25; cost trends per app. |
| [G4](#g4-no-engine-metrics-or-events) | builder-core | Job rates, latency and failure trends over time; live updates instead of polling. |
| [G5](#g5-signer-metrics-are-loopback-only) | signer | Drop the relay container. |
| [G6](#g6-usage-feed-has-no-time-filter) | batteries | Usage over a window without walking the whole history; no partial totals. |
| [G7](#g7-payer-deposit-and-reserve-not-shown) | this repository | Payer runway: deposit and reserve against the burn rate. |
| [G8](#g8-the-keys-mode-reader-holds-an-admin-key) | this repository | A console credential that cannot write even if the code tried, in both modes. |
| [G9](#g9-admin-reads-are-scoped-to-one-application) | builder-core | Per-actor money across every application. |
| [G10](#g10-no-application-wide-reconciliation-in-per_actor-mode) | builder-core | One reconciliation read for the Health page instead of one per actor. |
| [G11](#g11-reconciliation-flags-normal-sync-lag-as-unbalanced) | builder-core | An engine flag that only goes false on real money gaps, so it can drive alerts. |
| [G12](#g12-creating-a-grant-returns-an-incomplete-record) | builder-core | The created grant shown from one call. |
| [G13](#g13-no-who-am-i-call) | builder-core | The Builder names its actor from the moment it signs in. |
| [G14](#g14-rates-are-in-wei-only) | builder-core | Rates a builder can read in dollars before running a job. |

## G1: The Jobs page lists projections, not jobs

**Impact.** builder-core lists every actor's jobs to an admin or auditor (GET /v1/jobs, its D44), but the Jobs page still shows the newest cost projections and looks jobs up by id. builder-core has no filters or paging for that list yet.

**Fix.** List jobs from GET /v1/jobs with the reader's credential; ask builder-core for filters (actor, app, state, time) and paging.

**Owner.** this repository. **Unlocks:** A real Jobs page: throughput, failures by kind, per-actor and per-app job history.

## G3: Cost projections capped at 25

**Impact.** GET /v1/costs/projections returns at most the 25 newest projections and has no paging.

**Fix.** Cursor paging and a time window on /v1/costs/projections.

**Owner.** builder-core. **Unlocks:** Job cost history beyond the newest 25; cost trends per app.

## G4: No engine metrics or events

**Impact.** The engine has no /metrics (tech debt T4) and /v1/events answers 501 with `milestone: "held"` (builder-core D60: the events feed is held for M3, ISS-18), so job throughput and latency over time are not available.

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

## G8: The keys-mode reader holds an admin key

**Impact.** builder-core has a read-only auditor credential (its #69), and the OIDC reader uses one, so the engine refuses its writes. With CONSOLE_AUTH=keys the reader still holds an engine admin key, which can do everything; the console stays read-only there only because its code makes GET requests alone (tests/structure/read-only.test.ts).

**Fix.** Issue the keys-mode reader an auditor key (kind auditor) instead of an admin key; the Money page then shows the engine's grants as not available, as in OIDC mode.

**Owner.** this repository. **Unlocks:** A console credential that cannot write even if the code tried, in both modes.

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

## G12: Creating a grant returns an incomplete record

**Impact.** POST /v1/admin/grants answers 201 with the new grant's id but an empty name, status and total, so the console reads the grant list again after creating one instead of showing the response.

**Fix.** Map Batteries' create response fully in the engine (the grant list already maps the same fields).

**Owner.** builder-core. **Unlocks:** The created grant shown from one call.

## G13: No who-am-I call

**Impact.** Nothing tells a key which actor and application it belongs to, so the Builder learns its actor id from its newest job and shows none until the key has run one.

**Fix.** GET /v1/me returning the caller's actor, application, kind and permissions.

**Owner.** builder-core. **Unlocks:** The Builder names its actor from the moment it signs in.

## G14: Rates are in wei only

**Impact.** Offerings carry the orchestrators' rates in wei per their own unit, so a builder sees ETH, not dollars, before running a job; the cost afterwards is in USD from Batteries.

**Fix.** Add a USD rate beside the advertised one, with the ETH price, its source and its time (ISS-10).

**Owner.** builder-core. **Unlocks:** Rates a builder can read in dollars before running a job.

## Not a console gap: funded grants through the engine

With ChatLPT's credential layout (also builder-core's dev stack), `POST /v1/admin/grants` with a non-zero
amount fails with `provider HTTP 403`: the grant-desk credential has `grants.create` but not `grants.fund`,
and Batteries needs both for a funded grant; with no amount the engine refuses the grant. Found
20 October 2026. **Resolved for this stack 21 October:** `deploy/init-secrets.py` gives this stack's grant
desk `grants.fund`, so Operator actions can create funded grants (D15). ChatLPT's Batteries keeps its own
credentials and still uses the CLI.

## Closed

- **G2, no list of provisioned actors** (closed 28 October). builder-core #69 lists actors
  (`GET /v1/admin/actors`), and the Users and Operator pages read it; access keys only add the actors
  that hold a key the engine does not list yet.
