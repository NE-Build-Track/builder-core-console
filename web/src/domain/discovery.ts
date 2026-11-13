/**
 * Discovery as the console reads it (docs/references/data-sources.md#discovery): the GET /discovery document of
 * livepeer/node's `livepeer-discovery`, the one the engine reads too (builder-core D63). One entry per orchestrator,
 * after an entry listing the sources it read.
 */
import { z } from "zod";

/** `price_info` as advertised: node's schema makes every field optional (builder-core D63). */
const priceInfoSchema = z.looseObject({
  price: z.number().nullish(),
  price_usd: z.number().nullish(),
  currency: z.string().nullish(),
  unit: z.string().nullish(),
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

/** One orchestrator in the discovery document (livepeer-node's /discovery format). */
export const discoveredOrchestratorSchema = z.looseObject({
  address: z.string(),
  score: z.number().default(0),
  runners: z.array(discoveredRunnerSchema).default([]),
  last_seen: z.string().nullable().default(null),
});
export type DiscoveredOrchestrator = z.infer<typeof discoveredOrchestratorSchema>;

/** The entry `livepeer-discovery` serves first: the sources it read (`nodes`), with no `address` and no runners. */
const sourcesEntrySchema = z.strictObject({ nodes: z.array(z.unknown()) });

/** The orchestrators in the document; the sources entry is not one. */
export const discoverySchema = z
  .array(z.union([discoveredOrchestratorSchema, sourcesEntrySchema]))
  .transform((entries) => entries.filter((entry): entry is DiscoveredOrchestrator => "address" in entry));
