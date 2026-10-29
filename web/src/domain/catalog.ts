/**
 * Every upstream route the console calls, by source: the reads behind the pages, and the writes the
 * Operator and Builder areas make with a signed-in key (decisions D15–D18). tests/structure/docs.test.ts checks this list
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
  { source: "engine", route: "GET /v1/admin/grants", credential: "admin key (never the auditor: grants carry no application)", usedFor: "Money: the engine's view of grants" },
  { source: "engine", route: "GET /v1/admin/keys", credential: "admin key", usedFor: "Users: actors and admin keys" },
  { source: "engine", route: "GET /v1/allowance", credential: "admin key", usedFor: "Users: each actor's allocation" },
  { source: "engine", route: "GET /v1/costs/summary", credential: "admin key", usedFor: "Users and Usage: spend by cost class" },
  { source: "engine", route: "GET /v1/costs/projections", credential: "admin key", usedFor: "Jobs: newest costed jobs" },
  { source: "engine", route: "GET /v1/admin/reconciliation", credential: "admin key", usedFor: "Health and Users: balanced or not" },
  { source: "engine", route: "GET /v1/jobs/{job_id}", credential: "admin key", usedFor: "Jobs: lookup by id" },
  { source: "engine", route: "GET /v1/jobs/{job_id}/cost", credential: "admin key", usedFor: "Jobs: a job's cost by attempt" },
  { source: "engine", route: "GET /v1/jobs", credential: "actor key (Builder)", usedFor: "Builder: my jobs; sign-in: is the key working" },
  { source: "engine", route: "POST /v1/jobs", credential: "actor key (Builder)", usedFor: "Builder: run a job, streamed through" },
  { source: "engine", route: "POST /v1/admin/grants", credential: "admin key (Operator)", usedFor: "Operator: create a grant (operation reference)" },
  { source: "engine", route: "POST /v1/admin/grant/fund", credential: "admin key (Operator)", usedFor: "Operator: fund a grant (operation reference)" },
  { source: "engine", route: "POST /v1/admin/applications/{application_id}/actors/{actor_id}/allocation", credential: "admin key (Operator)", usedFor: "Operator: provision an actor (operation reference)" },
  { source: "engine", route: "POST /v1/admin/applications/{application_id}/actors/{actor_id}/allocation/fund", credential: "admin key (Operator)", usedFor: "Operator: fund an allocation (operation reference)" },
  { source: "engine", route: "POST /v1/admin/applications/{application_id}/actors/{actor_id}/allocation/status", credential: "admin key (Operator)", usedFor: "Operator: set allocation status" },
  { source: "engine", route: "POST /v1/admin/applications/{application_id}/actors/{actor_id}/allocation/rotate-key", credential: "admin key (Operator)", usedFor: "Operator: rotate the payment key (operation reference)" },
  { source: "engine", route: "POST /v1/admin/applications/{application_id}/actors/{actor_id}/allocation/revoke", credential: "admin key (Operator)", usedFor: "Operator: revoke an allocation" },
  { source: "engine", route: "POST /v1/admin/keys", credential: "admin key (Operator)", usedFor: "Operator: issue an access key (operation reference; shown once)" },
  { source: "engine", route: "GET /v1/admin/actors", credential: "admin or auditor token (Operator)", usedFor: "Operator: provisioned actors with their labels (builder-core #69); also the operator's sign-in check under CONSOLE_AUTH=oidc" },
  { source: "engine", route: "GET /v1/admin/keys/{key_id}", credential: "admin key (Operator)", usedFor: "Operator: inspect a key before rotating or revoking it (never its secret)" },
  { source: "engine", route: "POST /v1/admin/keys/{key_id}/rotate", credential: "admin key (Operator)", usedFor: "Operator: rotate an access key (operation reference; new key shown once)" },
  { source: "engine", route: "POST /v1/admin/keys/{key_id}/revoke", credential: "admin key (Operator)", usedFor: "Operator: revoke an access key" },
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
  { source: "discovery", route: "GET /discovery", credential: "none", usedFor: "Network: orchestrators; nav count" },
] as const satisfies readonly CatalogEntry[];
