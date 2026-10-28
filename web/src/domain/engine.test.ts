import { describe, expect, it } from "vitest";

import { attemptPayment, costClasses, mayHavePaid, type Attempt, type Job, type JobCost } from "./engine";

const attempt = (paid: boolean, outcome: string, states: string[] = []) =>
  ({ payment_sent: paid, outcome, sessions: states.map((payment_state) => ({ payment_state })) }) as unknown as Attempt;

describe("attemptPayment", () => {
  it("tells a payment the signer never confirmed from one that never happened (builder-core D54)", () => {
    expect(attemptPayment(attempt(true, "succeeded", ["paid"]))).toBe("paid");
    expect(attemptPayment(attempt(false, "payment_unknown", ["unknown"]))).toBe("unknown");
    expect(attemptPayment(attempt(false, "in_flight", ["unknown"]))).toBe("unknown"); // stored before signing
    expect(attemptPayment(attempt(false, "payment_refused", ["unpaid"]))).toBe("none");
    expect(attemptPayment(attempt(false, "refused"))).toBe("none");
  });

  it("says whether any attempt of a job may have paid", () => {
    const job = (...attempts: Attempt[]) => ({ attempts }) as unknown as Job;
    expect(mayHavePaid(job(attempt(false, "refused"), attempt(false, "payment_unknown", ["unknown"])))).toBe(true);
    expect(mayHavePaid(job(attempt(false, "refused"), attempt(false, "payment_refused", ["unpaid"])))).toBe(false);
  });
});

describe("costClasses", () => {
  it("keeps every class of a job that failed over, in attempt order (builder-core D52)", () => {
    const cost = (...classes: string[]) =>
      ({ attempts: classes.map((cost_class, index) => ({ attempt_number: index + 1, cost_class })) }) as unknown as JobCost;
    expect(costClasses(cost("failed_after_payment", "delivered"))).toEqual(["failed_after_payment", "delivered"]);
    expect(costClasses(cost("failed_after_payment", "failed_after_payment"))).toEqual(["failed_after_payment"]);
    expect(costClasses(cost())).toEqual([]);
  });
});
