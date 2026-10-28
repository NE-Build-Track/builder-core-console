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
  /** The source answered with an HTTP error. */
  | { readonly kind: "http"; readonly status: number; readonly detail: string }
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
      return `HTTP ${problem.status}: ${problem.detail}`;
    case "unexpected":
      return `unexpected response: ${problem.detail}`;
    case "not_permitted":
      return `not available to the console's credential: ${problem.detail}`;
  }
}

/** Apply `fn` to a successful reading; failures pass through unchanged. */
export function mapReading<T, U>(reading: Reading<T>, fn: (value: T) => U): Reading<U> {
  return reading.ok ? { ...reading, value: fn(reading.value) } : reading;
}
