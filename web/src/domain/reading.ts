/**
 * A Reading is one read of one source: either its value or why it could not be read.
 * Every adapter returns Readings instead of throwing, so one unreachable component never blanks a page;
 * the page shows what it has and names what it could not reach (docs/design-docs/core-beliefs.md).
 */

export type SourceName = "engine" | "batteries" | "signer" | "discovery" | "identity";

export type Reading<T> =
  | { readonly ok: true; readonly source: SourceName; readonly value: T; readonly readAt: string }
  | {
      readonly ok: false;
      readonly source: SourceName;
      readonly problem: Problem;
      readonly readAt: string;
    };

export type Problem =
  /** The console has no setting for this source (CONSOLE_* missing). */
  | { readonly kind: "not_configured"; readonly detail: string }
  /** Connection refused, DNS failure, timeout. */
  | { readonly kind: "unreachable"; readonly detail: string }
  /**
   * The source answered with an HTTP error. `code` is the engine's machine-readable reason when the body
   * has one (`operation_conflict`, `operation_in_progress`, `operation_exists`, `already_provisioned`: builder-core D57), and
   * `retryAfterS` its `Retry-After` in seconds.
   */
  | { readonly kind: "http"; readonly status: number; readonly detail: string; readonly code?: string; readonly retryAfterS?: number }
  /** The source answered 200 with a body the console does not recognise. */
  | { readonly kind: "unexpected"; readonly detail: string }
  /** The console's credential for this source may not read it: not a fault, nothing was asked. */
  | { readonly kind: "not_permitted"; readonly detail: string };

export function ok<T>(source: SourceName, value: T, readAt: string): Reading<T> {
  return { ok: true, source, value, readAt };
}

export function failed<T>(source: SourceName, problem: Problem, readAt: string): Reading<T> {
  return { ok: false, source, problem, readAt };
}

export function describeProblem(problem: Problem): string {
  switch (problem.kind) {
    case "not_configured":
      return `not configured: ${problem.detail}`;
    case "unreachable":
      return `unreachable: ${problem.detail}`;
    case "http":
      return `HTTP ${problem.status}: ${operationProblem(problem) ?? problem.detail}`;
    case "unexpected":
      return `unexpected response: ${problem.detail}`;
    case "not_permitted":
      return `not available to the console's credential: ${problem.detail}`;
  }
}

/** An engine refusal about an operation reference (builder-core D57), told apart by its code, never its text. */
function operationProblem(problem: Extract<Problem, { kind: "http" }>): string | null {
  switch (problem.code) {
    case "operation_in_progress":
      return `still running under this operation reference; retry ${problem.retryAfterS === undefined ? "shortly" : `in ${problem.retryAfterS} s`} with the same reference.`;
    case "operation_conflict":
      return "this operation reference was already used for a different request, so the engine did not apply this one. Send it under a new reference.";
    case "operation_exists":
      return `a job already ran under this operation reference, so it was not run again (${problem.detail}).`;
    case "already_provisioned":
      return "this actor is already provisioned, so nothing was applied, the amount included. Fund its allocation instead.";
    default:
      return null;
  }
}

/** Apply `fn` to a successful reading; failures pass through unchanged. */
export function mapReading<T, U>(reading: Reading<T>, fn: (value: T) => U): Reading<U> {
  return reading.ok ? { ...reading, value: fn(reading.value) } : reading;
}
