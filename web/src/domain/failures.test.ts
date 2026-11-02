import { describe, expect, it } from "vitest";

import type { Failure, Job } from "./engine";
import { failureAdvice, refusalOf } from "./failures";

const failure = (kind: Failure["kind"], reason: Failure["reason"] = null, message = "the engine's words"): Failure => ({ kind, reason, message, payment_sent: false });
const jobWith = (value: Failure) => ({ id: "job-1", state: "failed", failure: value, attempts: [] }) as unknown as Job;

describe("a failed job, told in plain words (builder-core D58, engine.md#failures)", () => {
  it("names each payment reason and what to do, from the engine's failure table", () => {
    expect(failureAdvice(failure("payment", "not_authorized"))).toMatchObject({
      title: "Payment refused: the signer refused the payer",
      code: "payment · not_authorized",
      todo: "An operator checks the actor's allocation and key; retrying does not help.",
    });
    expect(failureAdvice(failure("payment", "allowance_exhausted"))).toMatchObject({
      title: "Payment refused: the allocation is spent",
      todo: "An operator funds the allocation; then the same operation reference runs again.",
    });
    expect(failureAdvice(failure("payment", "signer_unavailable"))).toMatchObject({
      title: "Not paid: the signer could not be reached",
      todo: "Retry after the Retry-After header, with the same operation reference; an operator checks the signer if it lasts.",
    });
    expect(failureAdvice(failure("payment_unknown", "signer_unknown"))).toMatchObject({
      title: "Payment unknown: the signer gave no answer while signing",
      todo: "Do not retry blindly: a repeat under the same operation reference is 409, and a new one could pay twice.",
    });
  });

  it("keeps a payment failure with no reason (another refusal, or a job stored before D58) apart from the named ones", () => {
    const advice = failureAdvice(failure("payment"));
    expect(advice.code).toBe("payment");
    expect(advice.title).toBe("Payment failed before anything was signed");
  });

  it("has a meaning and a next step for every kind the engine can report", () => {
    const kinds: Failure["kind"][] = ["no_offering", "no_capacity", "not_provisioned", "refused", "unreachable", "payment", "payment_unknown", "timeout", "runner_rejected", "runner_error", "interrupted", "abandoned"];
    for (const kind of kinds) {
      const advice = failureAdvice(failure(kind));
      expect(advice.title, kind).not.toBe("");
      expect(advice.meaning, kind).not.toBe("");
      expect(advice.todo, kind).not.toBe("");
    }
  });

  it("keeps the engine's own message beside the plain words", () => {
    expect(failureAdvice(failure("payment", "allowance_exhausted", "the signer refused payment: allowance exhausted (HTTP 402)")).message).toBe(
      "the signer refused payment: allowance exhausted (HTTP 402)",
    );
  });
});

describe("a refused job submission (POST /v1/jobs answered with an error)", () => {
  it("reads 402, 403 and 503 with a job as the payment refusal they are, not a generic error", () => {
    const exhausted = refusalOf(402, { error: "x", job: jobWith(failure("payment", "allowance_exhausted")) });
    expect(exhausted).toMatchObject({ title: "Payment refused: the allocation is spent", jobId: "job-1", nothingPaid: true });
    const unauthorized = refusalOf(403, { error: "x", job: jobWith(failure("payment", "not_authorized")) });
    expect(unauthorized.title).toBe("Payment refused: the signer refused the payer");
    const down = refusalOf(503, { error: "x", job: jobWith(failure("payment", "signer_unavailable")) }, 10);
    expect(down).toMatchObject({ title: "Not paid: the signer could not be reached", retryAfterS: 10 });
  });

  it("tells not_provisioned from allowance_exhausted: both are 402, the kind decides", () => {
    expect(refusalOf(402, { error: "x", job: jobWith(failure("not_provisioned")) }).title).toBe("Your actor has no allocation");
  });

  it("reads a 403 without a job as the access policy, not a payment", () => {
    expect(refusalOf(403, { error: "actor may not run jobs" })).toMatchObject({ title: "This key may not run jobs", jobId: null, message: "actor may not run jobs" });
  });

  it("reads 413 request_too_large with the engine's limit (builder-core D59)", () => {
    const refusal = refusalOf(413, { error: "the request body exceeds 16777216 bytes", code: "request_too_large", limit_bytes: 16_777_216 });
    expect(refusal.title).toBe("The request is too large: the engine takes at most 16 MiB");
    expect(refusal.meaning).toContain("16777216 bytes");
    expect(refusal).toMatchObject({ jobId: null, nothingPaid: true });
  });

  it("does not claim a payment outcome for a payment_unknown refusal: it may have charged", () => {
    expect(refusalOf(503, { error: "x", job: jobWith(failure("payment_unknown", "signer_unknown")) }).nothingPaid).toBe(false);
  });

  it("falls back to the console's description when the body says nothing it knows", () => {
    expect(refusalOf(500, "oops", undefined, "HTTP 500: oops")).toMatchObject({ title: "HTTP 500: oops", advice: false });
    expect(refusalOf(null, undefined, undefined, "unreachable: connection refused").title).toBe("unreachable: connection refused");
    // the console's own refusal (a cross-origin post) has no engine body: not the engine's access policy
    expect(refusalOf(403, undefined, undefined, "Only the console itself may start a run.")).toMatchObject({ title: "Only the console itself may start a run.", advice: false });
  });
});
