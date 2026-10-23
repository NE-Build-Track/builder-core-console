/**
 * Engine types, generated from the pinned builder-core OpenAPI spec (openapi/engine.openapi.json). The types are
 * identical at a89216d, 93756ba, ad6bba9, 165e601, a22bc98 and b89c1bb; from 165e601 the spec adds only the bearer
 * security scheme.
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
export type Allowance = Schemas["Allowance"];
export type Money = Schemas["Money-Output"];
export type CostSummary = Schemas["CostSummary"];
export type Fees = Schemas["Fees"];
export type JobCost = Schemas["JobCost"];
export type Reconciliation = Schemas["Reconciliation"];
export type Job = Schemas["Job"];
export type Attempt = Schemas["Attempt"];

/** How a paid attempt is classified (docs/references/glossary.md#cost-classes). */
export const COST_CLASSES = ["delivered", "failed_after_payment", "uncertain", "pending"] as const;
export type CostClass = (typeof COST_CLASSES)[number];

export const COST_CLASS_LABELS: Record<CostClass, string> = {
  delivered: "Delivered",
  failed_after_payment: "Failed after payment",
  uncertain: "Uncertain",
  pending: "Pending",
};
