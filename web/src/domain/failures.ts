/**
 * Why a job failed or a submission was refused, in plain words, with what to do next. The words follow
 * builder-core's failure table (docs/contracts/engine.md#failures, D58 and D59): `kind` decides failover
 * and cost, `reason` names a payment failure's cause. Nothing here is the console's own advice; the
 * engine's message is always kept beside it.
 */
import type { Failure, Job } from "./engine";

type Kind = Failure["kind"];
type Reason = NonNullable<Failure["reason"]>;

type Row = { readonly title: string; readonly meaning: string; readonly todo: string };

const BY_KIND: Record<Kind, Row> = {
  no_offering: {
    title: "No runner serves this offering",
    meaning: "No runner serves the app, so nothing ran.",
    todo: "Check the name against the catalog (GET /v1/offerings); the same operation reference runs again.",
  },
  no_capacity: {
    title: "The engine is at capacity",
    meaning: "The engine's admission limits are full, so nothing ran.",
    todo: "Retry after the Retry-After header, with the same operation reference.",
  },
  not_provisioned: {
    title: "Your actor has no allocation",
    meaning: "The actor has no allocation to pay from (per_actor mode), so nothing ran.",
    todo: "An operator provisions it; retrying alone does not help. Then the same operation reference runs again.",
  },
  refused: {
    title: "Every runner refused the work",
    meaning: "Every runner tried refused before the app ran, so nothing ran.",
    todo: "Retry after the Retry-After header; the same operation reference runs again.",
  },
  unreachable: {
    title: "No runner could be reached",
    meaning: "Every runner tried could not be reached. The request may have reached a free runner.",
    todo: "Retry after the Retry-After header. A repeat under the same operation reference is 409: read the job and send a new reference.",
  },
  payment: {
    title: "Payment failed before anything was signed",
    meaning:
      "Another payment failure: the manifest could not be stored before signing, every runner refused the payment, the signer refused with another status, or its identity reply was malformed. Nothing was signed.",
    todo: "Retry after the Retry-After header, with the same operation reference.",
  },
  payment_unknown: {
    title: "Payment unknown: the signer gave no answer while signing",
    meaning: "The signer was asked and gave no validated answer while signing, so it may have charged. The job is uncertain and its cost pending until usage settles it.",
    todo: "Do not retry blindly: a repeat under the same operation reference is 409, and a new one could pay twice.",
  },
  timeout: {
    title: "The runner did not answer in time",
    meaning: "The runner did not answer in time; it may still have run the work.",
    todo: "Read the job: when uncertain, wait for its cost before running it again. A new attempt needs a new operation reference.",
  },
  runner_rejected: {
    title: "The runner refused the request",
    meaning: "The runner ran and refused the request; the failure body holds its words. A paid attempt is failed after payment, never billable.",
    todo: "Fix the request and send it with a new operation reference.",
  },
  runner_error: {
    title: "The runner failed",
    meaning: "The runner failed after it ran, or the engine did. A paid attempt is failed after payment, never billable.",
    todo: "It is not run again automatically: try later with a new operation reference.",
  },
  interrupted: {
    title: "The engine stopped while the job ran",
    meaning: "The engine restarted during the job; its next start resolves it uncertain when anything may have paid, else failed.",
    todo: "Read the job: one with no attempt never reached a runner and runs again under the same operation reference; otherwise treat it as a timeout.",
  },
  abandoned: {
    title: "The stream was left before its end",
    meaning: "The caller left the stream before its end; the bytes it did not read are gone.",
    todo: "Read the job for the outcome and cost. To get the result, run it again with a new operation reference.",
  },
};

const BY_REASON: Record<Reason, Row> = {
  not_authorized: {
    title: "Payment refused: the signer refused the payer",
    meaning:
      "Batteries answered 401 (an invalid or revoked payment key) or 403 (the grant or allocation is inactive, paused included, or a session binding mismatch). Nothing was paid.",
    todo: "An operator checks the actor's allocation and key; retrying does not help.",
  },
  allowance_exhausted: {
    title: "Payment refused: the allocation is spent",
    meaning: "The signer refused because the allocation has nothing left. Nothing was paid.",
    todo: "An operator funds the allocation; then the same operation reference runs again.",
  },
  signer_unavailable: {
    title: "Not paid: the signer could not be reached",
    meaning: "The signer could not be reached, or failed, before anything was signed. Nothing was paid, and no other runner was tried: they all share the signer.",
    todo: "Retry after the Retry-After header, with the same operation reference; an operator checks the signer if it lasts.",
  },
  signer_unknown: BY_KIND.payment_unknown,
};

/** Kinds after which nothing can have been paid ("Payment possible? no" in the engine's table). */
const UNPAID_KINDS: readonly Kind[] = ["no_offering", "no_capacity", "not_provisioned", "refused", "unreachable", "payment"];

export type FailureAdvice = Row & {
  /** `kind`, or `kind · reason`: the engine's machine words. */
  readonly code: string;
  /** The engine's own message. */
  readonly message: string;
};

export function failureAdvice(failure: Failure): FailureAdvice {
  const row = failure.reason ? BY_REASON[failure.reason] : BY_KIND[failure.kind];
  return { ...row, code: failure.reason ? `${failure.kind} · ${failure.reason}` : failure.kind, message: failure.message };
}

/** What a refused `POST /v1/jobs` means, for the Builder's result. */
export type Refusal = {
  readonly title: string;
  readonly message: string | null;
  readonly meaning: string | null;
  readonly todo: string | null;
  readonly code: string | null;
  readonly jobId: string | null;
  /** True when nothing can have been paid; false when it may have been; null when the answer does not say. */
  readonly nothingPaid: boolean | null;
  readonly retryAfterS: number | null;
  /** Whether the words come from the engine's failure table (false: the console's description of the answer). */
  readonly advice: boolean;
};

const MIB = 1024 * 1024;

/** A byte limit in words: "16 MiB", "1.5 MiB", "4096 bytes". */
export function sizeWords(bytes: number): string {
  if (bytes >= MIB) return bytes % MIB === 0 ? `${bytes / MIB} MiB` : `${(bytes / MIB).toFixed(1)} MiB`;
  return `${bytes} bytes`;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/**
 * The engine's error answer to a job submission, read by its `code` and the job in its body, never its
 * text. 402, 403 and 503 with a job are a payment or dispatch failure (D58); 413 `request_too_large` is the
 * request limit (D59); a 403 without a job is the access policy. Anything else keeps `fallback`.
 */
export function refusalOf(status: number | null, response: unknown, retryAfterS?: number, fallback?: string): Refusal {
  const body = record(response);
  const message = typeof body?.error === "string" ? body.error : null;
  const base = { message, code: null, jobId: null, retryAfterS: retryAfterS ?? null };
  if (body?.code === "request_too_large" && status === 413) {
    const limit = typeof body.limit_bytes === "number" ? body.limit_bytes : null;
    return {
      ...base,
      title: limit === null ? "The request is too large for the engine" : `The request is too large: the engine takes at most ${sizeWords(limit)}`,
      meaning: `The engine refuses a request body over ${limit === null ? "its limit" : `${limit} bytes`} before reading it or checking the key, so nothing ran and nothing was paid.`,
      todo: "Send a smaller input. A file the runner can fetch can go in the payload as a URL: the engine passes it on unchanged and the runner fetches it.",
      code: "request_too_large",
      nothingPaid: true,
      advice: true,
    };
  }
  const job = record(body?.job) as (Job & Record<string, unknown>) | null;
  const failure = job?.failure ?? null;
  if (status !== 409 && failure) {
    const advice = failureAdvice(failure);
    return {
      ...base,
      title: advice.title,
      message: advice.message,
      meaning: advice.meaning,
      todo: advice.todo,
      code: advice.code,
      jobId: typeof job?.id === "string" ? job.id : null,
      nothingPaid: UNPAID_KINDS.includes(failure.kind) && !failure.payment_sent,
      advice: true,
    };
  }
  if (status === 403 && body && !job) {
    return {
      ...base,
      title: "This key may not run jobs",
      meaning: "The engine's access policy refused the key before any job was made, so nothing ran and nothing was paid.",
      todo: "Sign in with an actor key that may run jobs.",
      nothingPaid: true,
      advice: true,
    };
  }
  return {
    ...base,
    title: fallback ?? (status === null ? "The engine did not answer" : `HTTP ${status}`),
    meaning: null,
    todo: null,
    jobId: typeof job?.id === "string" ? job.id : null,
    nothingPaid: null,
    advice: false,
  };
}
