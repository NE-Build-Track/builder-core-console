/**
 * Engine types, generated from the pinned builder-core OpenAPI spec (openapi/engine.openapi.json). The types are
 * identical at a89216d, 93756ba, ad6bba9, 165e601, a22bc98, b89c1bb, 878e4f4 and 629f1ab; from 165e601 the spec adds
 * only the bearer security scheme. d057935 (ISS-08) adds GET /v1/admin/keys/{key_id} and
 * POST /v1/admin/keys/{key_id}/rotate, with RotateKeyBody. d3df806 (releases/m3, the merge of builder-core #69; the spec is identical at its head a2e61e4) adds
 * the actor collection and the auditor, `payment_state` on each session, `JobCost.billable`, the `payment_unknown`
 * outcome and the native HTTP request fields.
 * Regenerate with `pnpm gen:api`; never edit engine-schema.d.ts by hand.
 */
import type { components } from "./engine-schema";

type Schemas = components["schemas"];

export type EngineHealth = Schemas["EngineHealth"];
export type Offering = Schemas["Offering"];
export type Runner = Schemas["Runner"];
export type NetworkRate = Schemas["NetworkRate"];
export type EngineGrant = Schemas["GrantRecord"];
export type AccessKey = Schemas["AccessKey"];
/** An actor the engine provisioned: its allocation, status and label (builder-core #69). */
export type ProvisionedActor = Schemas["ProvisionedActor"];
/** One row of GET /v1/admin/actors: provisioned, or a person an identity provider signed in (builder-core D48). */
export type KnownActor = Schemas["KnownActor"];
export type Allowance = Schemas["Allowance"];
export type Money = Schemas["Money-Output"];
export type CostSummary = Schemas["CostSummary"];
export type Fees = Schemas["Fees"];
export type JobCost = Schemas["JobCost"];
export type Reconciliation = Schemas["Reconciliation"];
export type Job = Schemas["Job"];
export type Attempt = Schemas["Attempt"];

/** How a paid attempt is classified (builder-core docs/contracts/payments.md#cost-classification). */
export const COST_CLASSES = ["delivered", "failed_after_payment", "uncertain", "pending"] as const;
export type CostClass = (typeof COST_CLASSES)[number];

export const COST_CLASS_LABELS: Record<CostClass, string> = {
  delivered: "Delivered",
  failed_after_payment: "Failed after payment",
  uncertain: "Uncertain",
  pending: "Pending",
};

/**
 * Whether an attempt paid. Since builder-core D54 a manifest is stored before the signer is asked, so an
 * attempt whose signer never answered (`payment_unknown`, or a manifest still `unknown`) may have paid
 * though `payment_sent` is false. Its cost stays pending until usage settles it.
 */
export type AttemptPayment = "paid" | "unknown" | "none";

export function attemptPayment(attempt: Attempt): AttemptPayment {
  if (attempt.payment_sent) return "paid";
  if (attempt.outcome === "payment_unknown" || attempt.sessions.some((session) => session.payment_state === "unknown")) return "unknown";
  return "none";
}

export function mayHavePaid(job: Job): boolean {
  return job.attempts.some((attempt) => attemptPayment(attempt) !== "none");
}

/** Every class a job's attempts fell into, in attempt order: a job that failed over is several (builder-core D52). */
export function costClasses(cost: JobCost): readonly CostClass[] {
  return [...new Set(cost.attempts.map((attempt) => attempt.cost_class))];
}
