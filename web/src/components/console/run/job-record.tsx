/**
 * A job's record as it settles after a run: state, each attempt and whether it paid (or may have:
 * builder-core D54), the result reference, and the wholesale network cost followed from pending to its
 * final status, with the billable part when a failover makes them differ (D52).
 */
import Link from "next/link";

import type { JobState } from "@/domain/builder";
import { attemptPayment, mayHavePaid, type Job } from "@/domain/engine";
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

const PAYMENT_WORDS = { paid: "paid", unknown: "payment unknown", none: "not paid" } as const;

/** What a failed job's payment means (builder-core D52, D54). The engine never pays twice for it. */
function failureNote(job: Job): string {
  if (job.state === "uncertain") return "The runner may have run and been charged, so the outcome is uncertain; the engine pays no one else for it.";
  if (job.failure?.payment_sent) return "Payment went out, but the work was refused or failed. That charge is failed after payment, never billable.";
  if (mayHavePaid(job)) return "The signer gave no answer, so it may have charged. The cost stays pending until usage settles it.";
  return "Nothing was paid.";
}

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
          <span>{failureNote(job)}</span>
        </div>
      ) : null}
      {job && job.attempts.length > 0 ? (
        <ol className="attempt-list" aria-label="Attempts">
          {job.attempts.map((attempt) => (
            <li key={attempt.number}>
              <b>Attempt {attempt.number}</b>
              <span className="mono">{attempt.orchestrator_url ?? "no orchestrator"}</span>
              <span>{attempt.outcome}</span>
              <span>{PAYMENT_WORDS[attemptPayment(attempt)]}</span>
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
            {cost.billable?.fee_usd != null && cost.billable.fee_usd !== cost.fees.fee_usd ? (
              <>
                {" "}
                · <Amount value={cost.billable.fee_usd} head={6} /> billable (the delivered attempt only)
              </>
            ) : null}
          </span>
        ) : null}
      </div>
      {state?.problem ? <p className="form-error">Could not read the job: {state.problem}</p> : null}
    </div>
  );
}
