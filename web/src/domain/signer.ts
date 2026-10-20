/**
 * The node remote signer as the console reads it (docs/references/data-sources.md#signer):
 * its metrics listener (/readyz, /metrics) through the relay, and its discovery on the signing port.
 */
import { z } from "zod";

/** The signer's Prometheus gauges and counters at NE-Build-Track/node 406b248. */
export const SIGNER_METRICS = [
  "livepeer_signer_up",
  "livepeer_signer_kafka_outbox_healthy",
  "livepeer_signer_kafka_pending_events",
  "livepeer_signer_kafka_pending_bytes",
  "livepeer_signer_kafka_oldest_event_age_seconds",
  "livepeer_signer_kafka_publish_errors_total",
  "livepeer_signer_kafka_enqueue_errors_total",
  "livepeer_signer_kafka_storage_errors_total",
] as const;

export type SignerMetricName = (typeof SIGNER_METRICS)[number];

/** Every known metric the signer reported; a metric it did not report is absent, not zero. */
export type SignerMetrics = Partial<Record<SignerMetricName, number>>;

export type SignerReadiness = {
  /** /readyz answered 200: chain access, positive deposit and reserve, fresh price rate, healthy outbox. */
  readonly ready: boolean;
  /** The body the signer gave, e.g. "signer payment dependencies unavailable". */
  readonly detail: string;
};

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

/** One orchestrator in the signer's discovery, with when the signer last heard from it. */
export const discoveredOrchestratorSchema = z.looseObject({
  address: z.string(),
  score: z.number().default(0),
  runners: z.array(discoveredRunnerSchema).default([]),
  last_seen: z.string().nullable().default(null),
});
export type DiscoveredOrchestrator = z.infer<typeof discoveredOrchestratorSchema>;

export const discoverySchema = z.array(discoveredOrchestratorSchema);
