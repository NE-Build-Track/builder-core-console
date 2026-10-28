/**
 * The discovery service as the console reads it (docs/references/data-sources.md#discovery): its
 * GET /discovery inventory, livepeer-node's format, one entry per orchestrator it serves.
 */
import { z } from "zod";

const priceInfoSchema = z.looseObject({
  price: z.number(),
  currency: z.string(),
  unit: z.string(),
});

export const discoveredRunnerSchema = z.looseObject({
  url: z.string(),
  app: z.string(),
  mode: z.string().default(""),
  capacity: z.number().int().nullable().default(null),
  capacity_used: z.number().int().nullable().default(null),
  capacity_available: z.number().int().nullable().default(null),
  metadata: z.string().nullable().default(null),
  price_info: priceInfoSchema.nullable().default(null),
});
export type DiscoveredRunner = z.infer<typeof discoveredRunnerSchema>;

/** One orchestrator in the discovery inventory (livepeer-node's /discovery format). */
export const discoveredOrchestratorSchema = z.looseObject({
  address: z.string(),
  score: z.number().default(0),
  runners: z.array(discoveredRunnerSchema).default([]),
  last_seen: z.string().nullable().default(null),
});
export type DiscoveredOrchestrator = z.infer<typeof discoveredOrchestratorSchema>;

export const discoverySchema = z.array(discoveredOrchestratorSchema);
