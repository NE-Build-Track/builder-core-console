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
    id: "G1",
    title: "The Jobs page lists projections, not jobs",
    impact:
      "builder-core lists every actor's jobs to an admin or auditor (GET /v1/jobs, its D44), but the Jobs page still shows the newest cost projections and looks jobs up by id. builder-core has no filters or paging for that list yet.",
    fix: "List jobs from GET /v1/jobs with the reader's credential; ask builder-core for filters (actor, app, state, time) and paging.",
    owner: "this repository",
  },
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
      "The engine has no /metrics (tech debt T4) and /v1/events answers 501 until M4, so job throughput and latency over time are not available.",
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
    id: "G7",
    title: "Payer deposit and reserve not shown",
    impact:
      "The signer's /readyz says only ready or not. Deposit and reserve amounts appear in Batteries' escrow report only when its on-chain listener runs, which this stack (like ChatLPT's) does not enable.",
    fix: "Enable the Batteries on-chain listener with the payer address, or read TicketBroker directly.",
    owner: "this repository",
  },
  {
    id: "G8",
    title: "The keys-mode reader holds an admin key",
    impact:
      "builder-core has a read-only auditor credential (its #69), and the OIDC reader uses one, so the engine refuses its writes. With CONSOLE_AUTH=keys the reader still holds an engine admin key, which can do everything; the console stays read-only there only because its code makes GET requests alone (tests/structure/read-only.test.ts).",
    fix: "Issue the keys-mode reader an auditor key (kind auditor) instead of an admin key; the Money page then shows the engine's grants as not available, as in OIDC mode.",
    owner: "this repository",
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
    id: "G12",
    title: "Creating a grant returns an incomplete record",
    impact:
      "POST /v1/admin/grants answers 201 with the new grant's id but an empty name, status and total, so the console reads the grant list again after creating one instead of showing the response.",
    fix: "Map Batteries' create response fully in the engine (the grant list already maps the same fields).",
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
      "Offerings carry the orchestrators' rates in wei per their own unit, so a builder sees ETH, not dollars, before running a job; the cost afterwards is in USD from Batteries.",
    fix: "Add a USD rate beside the advertised one, with the ETH price, its source and its time (ISS-10).",
    owner: "builder-core",
  },
] as const satisfies readonly Gap[];

export type GapId = (typeof GAPS)[number]["id"];

export function gap(id: GapId): Gap {
  const found = GAPS.find((item) => item.id === id);
  if (!found) throw new Error(`unknown gap ${id}`);
  return found;
}
