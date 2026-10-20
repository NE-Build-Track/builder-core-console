/**
 * Every upstream route the console reads, by source. tests/structure/docs.test.ts checks this list
 * against the adapters (no unlisted route is called) and against docs/references/data-sources.md.
 */
import type { SourceName } from "./reading";

export type CatalogEntry = {
  readonly source: SourceName;
  readonly route: string;
  readonly credential: string;
  readonly usedFor: string;
};

export const CATALOG = [
  { source: "engine", route: "GET /readyz", credential: "none", usedFor: "Health, discovery freshness, cost-sync age, version" },
  { source: "engine", route: "GET /v1/offerings", credential: "admin key", usedFor: "Network: apps on offer" },
  { source: "engine", route: "GET /v1/runners", credential: "admin key", usedFor: "Network: runners, GPU, capacity, price" },
  { source: "engine", route: "GET /v1/admin/grants", credential: "admin key", usedFor: "Money: the engine's view of grants" },
  { source: "engine", route: "GET /v1/admin/keys", credential: "admin key", usedFor: "Users: actors and admin keys" },
  { source: "engine", route: "GET /v1/allowance", credential: "admin key", usedFor: "Users: each actor's allocation" },
  { source: "engine", route: "GET /v1/costs/summary", credential: "admin key", usedFor: "Users and Usage: spend by cost class" },
  { source: "engine", route: "GET /v1/costs/projections", credential: "admin key", usedFor: "Jobs: newest costed jobs" },
  { source: "engine", route: "GET /v1/admin/reconciliation", credential: "admin key", usedFor: "Health and Users: balanced or not" },
  { source: "engine", route: "GET /v1/jobs/{job_id}", credential: "admin key", usedFor: "Jobs: lookup by id" },
  { source: "engine", route: "GET /v1/jobs/{job_id}/cost", credential: "admin key", usedFor: "Jobs: a job's cost by attempt" },
  { source: "batteries", route: "GET /readyz", credential: "none", usedFor: "Health" },
  { source: "batteries", route: "GET /v1/grants", credential: "console-reader", usedFor: "Money" },
  { source: "batteries", route: "GET /v1/allocations", credential: "console-reader", usedFor: "Money, Usage" },
  { source: "batteries", route: "GET /v1/api-keys", credential: "console-reader", usedFor: "Money: gateway keys per allocation" },
  { source: "batteries", route: "GET /v1/sessions", credential: "console-reader", usedFor: "Usage: app and orchestrator per payment" },
  { source: "batteries", route: "GET /v1/usage", credential: "console-reader", usedFor: "Usage; Jobs (by manifest_id)" },
  { source: "batteries", route: "GET /v1/ledger/report", credential: "console-reader", usedFor: "Money: ledger balances" },
  { source: "batteries", route: "GET /v1/escrow/report", credential: "console-reader", usedFor: "Money: payer deposit and reserve" },
  { source: "signer", route: "GET /readyz", credential: "none (metrics relay)", usedFor: "Health: able to pay" },
  { source: "signer", route: "GET /metrics", credential: "none (metrics relay)", usedFor: "Health: accounting outbox" },
  { source: "signer", route: "GET /discover-orchestrators", credential: "none", usedFor: "Network: orchestrators" },
] as const satisfies readonly CatalogEntry[];
