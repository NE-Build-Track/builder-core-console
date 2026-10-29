/**
 * Providers layer for the two writing areas (decision D15): the engine as seen with a signed-in key.
 * `EngineWriter` sends the Operator actions; `KeyedEngine` is what one key may read, and runs jobs for a
 * builder. Every write returns its exchange so the page can show the call (D18). These are the only
 * ports with write methods (tests/structure/writes.test.ts).
 */
import type { RunInput } from "@/domain/builder";
import type { AccessKey, Allowance, CostSummary, EngineGrant, Job, JobCost, Offering, KnownActor, Runner } from "@/domain/engine";
import type { Exchange } from "@/domain/exchange";
import type { PlannedCall } from "@/domain/operator";
import type { Problem, Reading } from "@/domain/reading";

export type Written =
  | {
      readonly ok: true;
      readonly value: unknown;
      /** The engine answered from its record of this operation reference (`Idempotent-Replayed: true`, D57): nothing was applied again. */
      readonly replayed: boolean;
      readonly exchange: Exchange;
    }
  | { readonly ok: false; readonly problem: Problem; readonly exchange: Exchange };

export interface EngineWriter {
  /** Send one planned Operator call exactly as reviewed. */
  send(call: PlannedCall): Promise<Written>;
}

/** A job run as it starts: the runner's response streams in `body`, or the engine answered an error. */
export type RunStarted =
  | {
      readonly ok: true;
      readonly status: number;
      readonly contentType: string;
      readonly jobId: string | null;
      readonly body: ReadableStream<Uint8Array>;
      readonly exchange: Exchange;
    }
  | { readonly ok: false; readonly status: number | null; readonly response: unknown; readonly problem: Problem; readonly exchange: Exchange };

export interface KeyedEngine {
  /** Probes for sign-in: an admin key may list keys; any working key may list its own jobs. */
  adminKeys(): Promise<Reading<readonly AccessKey[]>>;
  /** Admin only: one key as the engine stores it, never its secret (ISS-08), for the key actions' review. */
  adminKey(keyId: string): Promise<Reading<AccessKey>>;
  myJobs(limit: number): Promise<Reading<readonly Job[]>>;
  /** Admin or auditor: every known actor, provisioned or only signed in (GET /v1/admin/actors, builder-core D48). */
  adminActors(limit: number): Promise<Reading<readonly KnownActor[]>>;
  offerings(): Promise<Reading<readonly Offering[]>>;
  runners(app: string): Promise<Reading<readonly Runner[]>>;
  job(id: string): Promise<Reading<Job>>;
  jobCost(id: string): Promise<Reading<JobCost>>;
  /** The caller's own allowance, or an actor's when the key is an admin key. */
  allowance(actorId?: string): Promise<Reading<Allowance>>;
  /** Admin only: the grants the engine can see, for the review step. */
  grants(): Promise<Reading<readonly EngineGrant[]>>;
  costSummary(start: string, end: string): Promise<Reading<CostSummary>>;
  /** POST /v1/jobs. `signal` ends the call when the browser goes away, which the engine treats as a disconnect. */
  run(input: RunInput, signal: AbortSignal): Promise<RunStarted>;
}
