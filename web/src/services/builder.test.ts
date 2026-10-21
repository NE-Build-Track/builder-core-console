import { describe, expect, it } from "vitest";

import type { Job, JobCost, Offering } from "@/domain/engine";
import { NOW, read } from "../../tests/support/fixtures";

import { catalogEntry, jobState, parseRun, rateText, unitWords } from "./builder";

const offering = (overrides: Partial<Offering>): Offering => ({
  app: "blueclaw/chat/qwen3.8-27b",
  modes: ["immediate"],
  runner_count: 2,
  ready_count: 2,
  rate_low: { amount: "4492197255", currency: "wei", unit: "seconds" },
  rate_high: { amount: "4492197255", currency: "wei", unit: "seconds" },
  observed_at: new Date(NOW.getTime() - 20_000).toISOString(),
  ...overrides,
});

describe("builder catalog", () => {
  it("reads rates exactly as advertised, in words a builder can use", () => {
    expect(unitWords("seconds")).toBe("per second");
    expect(unitWords("fixed")).toBe("per request");
    expect(unitWords("720p-pixel-seconds")).toBe("per 720p pixel-second");
    expect(rateText("4492197255", "wei", "seconds")).toBe("0.000000004492197255 ETH per second (4492197255 wei)");
    expect(rateText("0.002", "USD", "fixed")).toBe("0.002 USD per request");
  });

  it("marks an offering with no ready runner, no rate, or an old read", () => {
    expect(catalogEntry(offering({}), NOW).notes).toEqual([]);
    const old = catalogEntry(offering({ ready_count: 0, rate_low: null, rate_high: null, observed_at: new Date(NOW.getTime() - 3_600_000).toISOString() }), NOW);
    expect(old.stale).toBe(true);
    expect(old.notes).toEqual(["No runner is ready right now.", "No rate advertised.", "Read too long ago to trust."]);
  });
});

describe("run requests from the browser", () => {
  const good = { app: "blueclaw/chat/qwen3.8-27b", path: "/v1/chat/completions", method: "POST", payload: { messages: [] }, stream: true, timeoutS: 120, maxAttempts: 2, operationRef: "console-run-1234abcd" };

  it("takes a well-formed request", () => {
    expect(parseRun(good)).toEqual({ ok: true, value: good });
  });

  it("names the first thing wrong, trusting nothing", () => {
    expect(parseRun({ ...good, path: "v1 chat" })).toMatchObject({ ok: false, field: "path" });
    expect(parseRun({ ...good, payload: [1, 2] })).toMatchObject({ ok: false, field: "payload" });
    expect(parseRun({ ...good, method: "DELETE" })).toMatchObject({ ok: false, field: "method" });
    expect(parseRun({ ...good, timeoutS: 9999 })).toMatchObject({ ok: false, field: "timeoutS" });
    expect(parseRun({ ...good, operationRef: "x" })).toMatchObject({ ok: false, field: "operationRef" });
    expect(parseRun("nope")).toMatchObject({ ok: false, field: "body" });
  });
});

describe("a job settling", () => {
  const job = (state: string, paid: boolean) => ({ id: "j", state, attempts: [{ payment_sent: paid }] }) as unknown as Job;
  const cost = (status: string) => ({ status }) as unknown as JobCost;

  it("waits for a paid job's cost, but not for one that paid nothing", () => {
    expect(jobState(read("engine", job("running", true)), read("engine", cost("pending"))).settled).toBe(false);
    expect(jobState(read("engine", job("succeeded", true)), read("engine", cost("pending"))).settled).toBe(false);
    expect(jobState(read("engine", job("succeeded", true)), read("engine", cost("observed"))).settled).toBe(true);
    expect(jobState(read("engine", job("failed", false)), read("engine", cost("pending"))).settled).toBe(true);
  });
});
