# Gaps

What the console cannot show yet, what would fix it, and who owns the fix. `web/src/domain/gaps.ts`
holds the same list (pages cite it next to the data it limits); `web/tests/structure/docs.test.ts`
fails when the two disagree. The console works within these today; nothing here blocks v1.

| Gap | Owner | Unlocks |
| --- | --- | --- |
| [G3](#g3-cost-projections-capped-at-25) | builder-core | Job cost history beyond the newest 25; cost trends per app. |
| [G4](#g4-no-engine-metrics-or-events) | builder-core | Job rates, latency and failure trends over time; live updates instead of polling. |
| [G5](#g5-signer-metrics-are-loopback-only) | signer | Drop the relay container. |
| [G6](#g6-usage-feed-has-no-time-filter) | batteries | Usage over a window without walking the whole history; no partial totals. |
| [G9](#g9-admin-reads-are-scoped-to-one-application) | builder-core | Per-actor money across every application. |
| [G10](#g10-no-application-wide-reconciliation-in-per_actor-mode) | builder-core | One reconciliation read for the Health page instead of one per actor. |
| [G11](#g11-reconciliation-flags-normal-sync-lag-as-unbalanced) | builder-core | An engine flag that only goes false on real money gaps, so it can drive alerts. |
| [G13](#g13-no-who-am-i-call) | builder-core | The Builder names its actor from the moment it signs in. |
| [G14](#g14-rates-are-in-wei-only) | builder-core | Rates a builder can read in dollars before running a job. |
| [G15](#g15-the-job-list-has-no-filters) | builder-core | Per-actor and per-app job history, and failures by kind, without paging through every job. |

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

## G13: No who-am-I call

**Impact.** Nothing tells a key which actor and application it belongs to, so the Builder learns its actor id from its newest job and shows none until the key has run one.

**Fix.** GET /v1/me returning the caller's actor, application, kind and permissions.

**Owner.** builder-core. **Unlocks:** The Builder names its actor from the moment it signs in.

## G14: Rates are in wei only

**Impact.** Offerings carry the orchestrators' rates in their own currency and unit, mostly wei, so a builder sees ETH, not dollars, before running a job; the cost afterwards is in USD from Batteries. Since builder-core D62 (PR #77, merged) a rate carries the runner's own `price_usd` when it advertises one, and the catalog shows it beside the wei rate, but it is the runner's figure, passed on unconverted, and most orchestrators send none (on 2 November, one of the three the stack's discovery reached did).

**Fix.** A USD rate for every runner, with the ETH price, its source and its time (ISS-10): a conversion in the engine, or orchestrators that all advertise `price_usd`.

**Owner.** builder-core. **Unlocks:** Rates a builder can read in dollars before running a job.

## G15: The job list has no filters

**Impact.** The Jobs page lists every actor's jobs newest first (`GET /v1/jobs`, paged with `before`), but the engine takes no filter, so finding one actor's, one app's or one state's jobs means paging through the rest.

**Fix.** Filters on `GET /v1/jobs`: `actor_id`, `app`, `state` and a time window (builder-core's ISS-29 REST guide proposes the paging cursor, not the filters).

**Owner.** builder-core. **Unlocks:** Per-actor and per-app job history, and failures by kind, without paging through every job.

## Not a console gap: funded grants through the engine

With ChatLPT's credential layout (also builder-core's dev stack), `POST /v1/admin/grants` with a non-zero
amount fails with `provider HTTP 403`: the grant-desk credential has `grants.create` but not `grants.fund`,
and Batteries needs both for a funded grant; with no amount the engine refuses the grant. Found
20 October 2026. **Resolved for this stack 21 October:** `deploy/init-secrets.py` gives this stack's grant
desk `grants.fund`, so Operator actions can create funded grants (D15). ChatLPT's Batteries keeps its own
credentials and still uses the CLI.

## Closed

- **G7, payer deposit and reserve were not shown** (closed 2 November). The stack runs Batteries' on-chain
  listener (`BATTERIES_ONCHAIN_LISTENER`, `PAYER_ADDRESS` in `deploy/.env`; it polls the signer's RPC every
  30 s and opens with a `getSenderInfo` snapshot, so no start block is needed). The Money page shows the
  payer's TicketBroker deposit and reserve from `GET /v1/escrow/report`, which serves ETH decimals
  (`deposit_balance_eth`, not the store's wei: the console's schema expected wei until it was seen live).
- **G8, the keys-mode reader held an admin key** (closed 2 November). With `CONSOLE_AUTH=keys` the
  console now reads with `CONSOLE_ENGINE_READER_TOKEN`, an auditor key `first-run.sh` issues, which the
  engine lets only read (builder-core D46), as the OIDC reader already did; `deploy/compose.yaml` blanks
  the admin key and the engine's Batteries tokens for the console container. The Money page shows the
  engine's grants as not available in both modes (grants carry no application, builder-core #69).
- **G1, the Jobs page listed projections, not jobs** (closed 2 November). The Jobs page lists every
  actor's jobs in the application from `GET /v1/jobs` (builder-core D44), newest first, 50 at a time, paging
  with `before` (D59). The engine takes no filters yet: that is G15.
- **G12, creating a grant returned an incomplete record** (closed 30 October). builder-core's
  `POST /v1/admin/grants` now answers with the grant's name, status and total (seen live on the stack:
  `{"name": …, "status": "active", "total": "0.01"}`; `scripts/live-check-d57.py` A5, "created grant
  read back in full"). The Operator result step still shows only the new grant's id and the amount
  sent; showing the response's name, status and total is a small follow-up, not a gap.
- **G2, no list of provisioned actors** (closed 28 October). builder-core #69 lists actors
  (`GET /v1/admin/actors`), and the Users and Operator pages read it; access keys only add the actors
  that hold a key the engine does not list yet.
