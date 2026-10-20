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
    title: "No admin job list",
    impact:
      "GET /v1/jobs returns only the caller's own jobs, even for an admin, so the console cannot list jobs across actors. It shows recent cost projections and looks jobs up by id instead.",
    fix: "An admin-scoped job list with filters (actor, app, state, time) and paging.",
    owner: "builder-core",
  },
  {
    id: "G2",
    title: "No list of provisioned actors",
    impact:
      "The engine has no route that lists actor allocations, so the console derives actors from access keys and reads each actor's allowance one by one.",
    fix: "GET /v1/admin/actors returning ProvisionedActor rows.",
    owner: "builder-core",
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
    title: "No read-only engine credential",
    impact:
      "An engine admin key can do everything; DefaultPolicy ignores permissions for admins. The console stays read-only only because its code makes GET requests alone (tests/structure/read-only.test.ts).",
    fix: "A read-only admin credential kind, or permissions that apply to admin keys.",
    owner: "builder-core",
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
] as const satisfies readonly Gap[];

export type GapId = (typeof GAPS)[number]["id"];

export function gap(id: GapId): Gap {
  const found = GAPS.find((item) => item.id === id);
  if (!found) throw new Error(`unknown gap ${id}`);
  return found;
}
