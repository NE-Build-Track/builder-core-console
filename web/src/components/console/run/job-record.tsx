/**
 * A job's record as it settles after a run: state, each attempt and whether it paid, the result
 * reference, and the wholesale network cost followed from pending to its final status.
 */
import Link from "next/link";

import type { JobState } from "@/domain/builder";
import type { State } from "@/domain/views";

import { Amount, Id, Pill } from "../values";

const JOB_STATES: Record<string, State> = { succeeded: "ok", running: "unknown", queued: "unknown", failed: "bad", uncertain: "warn" };
const COST_STATES: Record<string, State> = { none: "ok", pending: "unknown", observed: "ok", corrected: "ok" };
const COST_WORDS: Record<string, string> = {
  none: "nothing paid ($0)",
  pending: "pending: waiting for Batteries",
  observed: "observed",
  corrected: "corrected",
};

export function JobRecord({ jobId, state }: { readonly jobId: string; readonly state: JobState | null }) {
  const job = state?.job ?? null;
  const cost = state?.cost ?? null;
  return (
    <div className="job-record">
      <div className="admin-row">
        <span>
          Job <Id value={jobId} />
        </span>
        <Pill state={job ? (JOB_STATES[job.state] ?? "unknown") : "unknown"} live={!state?.settled}>
          {job?.state ?? "reading…"}
        </Pill>
        <Link href={`/builder/jobs?id=${jobId}`}>Open in My jobs</Link>
      </div>
      {job?.failure ? (
        <div className="problem" role="status">
          <strong>
            {job.failure.kind}: {job.failure.message}
          </strong>
          <span>{job.failure.payment_sent ? "Payment went out, so the outcome is uncertain and it is never retried by itself." : "Nothing was paid."}</span>
        </div>
      ) : null}
      {job && job.attempts.length > 0 ? (
        <ol className="attempt-list" aria-label="Attempts">
          {job.attempts.map((attempt) => (
            <li key={attempt.number}>
              <b>Attempt {attempt.number}</b>
              <span className="mono">{attempt.orchestrator_url ?? "no orchestrator"}</span>
              <span>{attempt.outcome}</span>
              <span>{attempt.payment_sent ? "paid" : "not paid"}</span>
              {attempt.status_code ? <span className="muted">HTTP {attempt.status_code}</span> : null}
            </li>
          ))}
        </ol>
      ) : null}
      {job?.result ? (
        <p className="provenance">
          Result: {job.result.size_bytes.toLocaleString("en-US")} bytes of {job.result.content_type}, sha256 <Id value={job.result.sha256} short /> (kept inline;
          the engine stores no result body in M3)
        </p>
      ) : null}
      <div className="admin-row">
        <span>Network cost</span>
        <Pill state={cost ? (COST_STATES[cost.status] ?? "unknown") : "unknown"} live={cost?.status === "pending"}>
          {cost ? (COST_WORDS[cost.status] ?? cost.status) : "reading…"}
        </Pill>
        {cost && cost.fees.fee_usd !== null && cost.status !== "none" ? (
          <span>
            <Amount value={cost.fees.fee_usd} head={6} /> wholesale · {cost.fees.row_count} ticket{cost.fees.row_count === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
      {state?.problem ? <p className="form-error">Could not read the job: {state.problem}</p> : null}
    </div>
  );
}
