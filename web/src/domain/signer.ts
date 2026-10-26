/**
 * The node remote signer as the console reads it (docs/references/data-sources.md#signer): its metrics
 * listener (/readyz, /metrics) through the relay. The signer only signs; discovery is its own service.
 */
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
