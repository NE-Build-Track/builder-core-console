import { describe, expect, it } from "vitest";

import { describeProblem } from "./reading";

describe("describing a problem", () => {
  it("says a command still running under its reference is still running, and when to retry (D57)", () => {
    const problem = { kind: "http" as const, status: 409, detail: "operation 'r1' is still running", code: "operation_in_progress", retryAfterS: 1 };
    expect(describeProblem(problem)).toBe("HTTP 409: still running under this operation reference; retry in 1 s with the same reference.");
  });

  it("says a reference already used for a different request was not applied, and needs a new one (D57)", () => {
    const problem = { kind: "http" as const, status: 409, detail: "operation_ref 'r1' was used for another request", code: "operation_conflict" };
    expect(describeProblem(problem)).toBe(
      "HTTP 409: this operation reference was already used for a different request, so the engine did not apply this one. Send it under a new reference.",
    );
  });

  it("says a job that already ran under its reference was not run again, naming the job (D57)", () => {
    const problem = { kind: "http" as const, status: 409, detail: "operation_ref 'r1' already used by job j1", code: "operation_exists" };
    expect(describeProblem(problem)).toBe("HTTP 409: a job already ran under this operation reference, so it was not run again (operation_ref 'r1' already used by job j1).");
  });

  it("says an actor already provisioned was not provisioned again, and that funding is the way to add to it (D57)", () => {
    const problem = { kind: "http" as const, status: 409, detail: "actor 'alice' is already provisioned (allocation a1); fund it instead", code: "already_provisioned" };
    expect(describeProblem(problem)).toBe(
      "HTTP 409: this actor is already provisioned, so nothing was applied, the amount included. Fund its allocation instead.",
    );
  });

  it("keeps the engine's own words for any other refusal", () => {
    expect(describeProblem({ kind: "http", status: 409, detail: "grant g1 has too little unallocated", code: "something_new" })).toBe("HTTP 409: grant g1 has too little unallocated");
  });
});
