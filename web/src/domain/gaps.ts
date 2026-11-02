/**
 * What the console cannot show yet, and what would fix it. The system of record is
 * docs/references/gaps.md; tests/structure/docs.test.ts fails when this list and that file disagree.
 * Pages cite gaps by id next to the data they limit, so a reader sees the hole and where it is tracked.
 */

export type GapOwner = "builder-core" | "batteries" | "signer" | "this repository";

export type Gap = {
  readonly id: string;
  readonly title: string;
  /** What a reader of the console cannot see or trust because of the gap. */
  readonly impact: string;
  /** The smallest change that would close it, and where. */
  readonly fix: string;
  readonly owner: GapOwner;
};

export const GAPS = [
  {
    id: "G3",
    title: "Cost projections capped at 25",
    impact: "GET /v1/costs/projections returns at most the 25 newest projections and has no paging.",
    fix: "Cursor paging and a time window on /v1/costs/projections.",
    owner: "builder-core",
  },
  {
    id: "G4",
    title: "No engine metrics or events",
    impact:
      'The engine has no /metrics (tech debt T4) and /v1/events answers 501 with milestone: "held" (builder-core D60: the events feed is held for M3, ISS-18), so job throughput and latency over time are not available.',
    fix: "Engine /metrics (job, discovery and cost-sync counters) and the events feed.",
    owner: "builder-core",
  },
  {
    id: "G5",
    title: "Signer metrics are loopback-only",
    impact:
      "The signer refuses to bind its metrics listener off loopback, so the console reads it through a relay container that shares the signer's network namespace.",
    fix: "Already worked around in deploy/compose.yaml (signer-metrics). An upstream option to bind a private address would remove the relay.",
    owner: "signer",
  },
  {
    id: "G6",
    title: "Usage feed has no time filter",
    impact:
      "Batteries /v1/usage pages oldest-first with no time filter, so usage over a window means walking the whole feed. The console stops at a row cap and marks totals as partial when it does.",
    fix: "A since/until filter (or newest-first order) on /v1/usage and /v1/sessions.",
    owner: "batteries",
  },
  {
    id: "G9",
    title: "Admin reads are scoped to one application",
    impact:
      "Allowance, cost summary and projections use the admin key's own application_id, so per-actor money shows only for CONSOLE_APPLICATION_ID. Reconciliation takes any application.",
    fix: "An application_id parameter on the admin reads.",
    owner: "builder-core",
  },
  {
    id: "G10",
    title: "No application-wide reconciliation in per_actor mode",
    impact:
      "GET /v1/admin/reconciliation without an actor answers 404 in per_actor mode, so the console reconciles each actor and sums the verdicts itself.",
    fix: "Reconcile an application across all its actor allocations in the engine.",
    owner: "builder-core",
  },
  {
    id: "G11",
    title: "Reconciliation flags normal sync lag as unbalanced",
    impact:
      "The engine's balanced flag is false whenever Batteries has charged tickets its 30-second cost sync has not read yet, which is all the time while paid jobs run. The console tells this apart (no unattributed rows and Batteries ahead means catching up), but the engine's own flag cannot be alerted on.",
    fix: "Reconcile only up to the last synced usage row, or report the unsynced amount separately from unattributed spend.",
    owner: "builder-core",
  },
  {
    id: "G13",
    title: "No who-am-I call",
    impact:
      "Nothing tells a key which actor and application it belongs to, so the Builder learns its actor id from its newest job and shows none until the key has run one.",
    fix: "GET /v1/me returning the caller's actor, application, kind and permissions.",
    owner: "builder-core",
  },
  {
    id: "G14",
    title: "Rates are in wei only",
    impact:
      "Offerings carry the orchestrators' rates in their own currency and unit, mostly wei, so a builder sees ETH, not dollars, before running a job; the cost afterwards is in USD from Batteries. Since builder-core D62 (PR #77, merged) a rate carries the runner's own price_usd when it advertises one, and the catalog shows it beside the wei rate, but it is the runner's figure, passed on unconverted, and most orchestrators send none (on 2 November, one of the three the stack's discovery reached did).",
    fix: "A USD rate for every runner, with the ETH price, its source and its time (ISS-10): a conversion in the engine, or orchestrators that all advertise price_usd.",
    owner: "builder-core",
  },
  {
    id: "G15",
    title: "The job list has no filters",
    impact:
      "The Jobs page lists every actor's jobs newest first (GET /v1/jobs, paged with before), but the engine takes no filter, so finding one actor's, one app's or one state's jobs means paging through the rest.",
    fix: "Filters on GET /v1/jobs: actor_id, app, state and a time window (builder-core's ISS-29 REST guide proposes the paging cursor, not the filters).",
    owner: "builder-core",
  },
] as const satisfies readonly Gap[];

export type GapId = (typeof GAPS)[number]["id"];

export function gap(id: GapId): Gap {
  const found = GAPS.find((item) => item.id === id);
  if (!found) throw new Error(`unknown gap ${id}`);
  return found;
}
