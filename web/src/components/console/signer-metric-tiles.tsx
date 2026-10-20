"use client";

import { useState } from "react";

import type { SignerMetrics } from "@/domain/signer";

import { Spark } from "./primitives";
import { Pill } from "./values";

type Sample = { readonly at: string; readonly pending: number; readonly oldest: number };

/**
 * The signer's outbox metrics as tiles. The stack keeps no history (decision D6), so the sparklines are
 * the samples this page has seen since it opened: one per refresh, the newest 40.
 */
export function SignerMetricTiles({ metrics, readAt }: { readonly metrics: SignerMetrics; readonly readAt: string }) {
  const pending = metrics.livepeer_signer_kafka_pending_events;
  const oldest = metrics.livepeer_signer_kafka_oldest_event_age_seconds;
  const [samples, setSamples] = useState<readonly Sample[]>(() => [{ at: readAt, pending: pending ?? 0, oldest: oldest ?? 0 }]);
  // A refresh brings a new reading: keep it as the next sample (React's "adjust state on prop change" pattern).
  if (samples.at(-1)?.at !== readAt) {
    setSamples([...samples, { at: readAt, pending: pending ?? 0, oldest: oldest ?? 0 }].slice(-40));
  }
  const errors = metrics.livepeer_signer_kafka_publish_errors_total;
  const healthy = metrics.livepeer_signer_kafka_outbox_healthy;
  const history = samples.length >= 2 ? `${samples.length} samples since this page opened` : "history starts when this page opens";
  return (
    <div className="grid stagger signer-tiles">
      <div className="tile metric lift">
        <span className="k">livepeer_signer_kafka_pending_events</span>
        <span className="v" data-num="">
          {pending ?? "—"}
        </span>
        <span className="s">events waiting in the outbox · {history}</span>
        <Spark values={samples.map((sample) => sample.pending)} max={Math.max(10, ...samples.map((sample) => sample.pending))} />
      </div>
      <div className="tile metric lift">
        <span className="k">oldest_event_age_seconds</span>
        <span className="v" data-num="">
          {oldest ?? "—"}
          <small>s</small>
        </span>
        <span className="s">age of the oldest pending event</span>
        <Spark values={samples.map((sample) => sample.oldest)} max={Math.max(5, ...samples.map((sample) => sample.oldest))} />
      </div>
      <div className="tile metric lift">
        <span className="k">publish_errors_total</span>
        <span className="v" data-num="">
          {errors ?? "—"}
        </span>
        <span className="s">
          {errors === undefined ? <Pill state="unknown">not reported</Pill> : errors === 0 ? <Pill state="ok">none since start</Pill> : <Pill state="warn">since the signer started</Pill>}
        </span>
      </div>
      <div className="tile metric lift">
        <span className="k">outbox_healthy</span>
        <span className="v" data-num="">
          {healthy ?? "—"}
        </span>
        <span className="s">
          {healthy === 1 ? (
            <Pill state="ok" live>
              Healthy
            </Pill>
          ) : healthy === 0 ? (
            <Pill state="bad">Unhealthy</Pill>
          ) : (
            <Pill state="unknown">not reported</Pill>
          )}
        </span>
      </div>
    </div>
  );
}
