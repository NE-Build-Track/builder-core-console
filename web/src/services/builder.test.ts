import { describe, expect, it } from "vitest";

import { PRESETS } from "@/domain/builder";
import type { Allowance, CostSummary, Fees, Job, JobCost, Offering } from "@/domain/engine";
import type { Reading } from "@/domain/reading";
import { broken, NOW, read } from "../../tests/support/fixtures";

import { allocationNotice, catalogEntry, jobRow, jobState, parseRun, rateText, unitWords, usage } from "./builder";

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
  const job = (state: string, paid: boolean, outcome = "succeeded", sessions: { payment_state: string }[] = []) =>
    ({ id: "j", state, attempts: [{ payment_sent: paid, outcome, sessions }] }) as unknown as Job;
  const cost = (status: string) => ({ status }) as unknown as JobCost;

  it("waits for a paid job's cost, but not for one that paid nothing", () => {
    expect(jobState(read("engine", job("running", true)), read("engine", cost("pending"))).settled).toBe(false);
    expect(jobState(read("engine", job("succeeded", true)), read("engine", cost("pending"))).settled).toBe(false);
    expect(jobState(read("engine", job("succeeded", true)), read("engine", cost("observed"))).settled).toBe(true);
    expect(jobState(read("engine", job("failed", false)), read("engine", cost("pending"))).settled).toBe(true);
  });

  it("keeps waiting when the signer never answered: it may have charged (builder-core D54)", () => {
    const unknown = job("uncertain", false, "payment_unknown", [{ payment_state: "unknown" }]);
    expect(jobState(read("engine", unknown), read("engine", cost("pending"))).settled).toBe(false);
    expect(jobState(read("engine", unknown), read("engine", cost("observed"))).settled).toBe(true);
    const refused = job("failed", false, "payment_refused", [{ payment_state: "unpaid" }]);
    expect(jobState(read("engine", refused), read("engine", cost("pending"))).settled).toBe(true); // nothing paid
  });
});

describe("a builder with no allocation", () => {
  const none: Reading<Allowance> = broken("engine", { kind: "http", status: 404, detail: "no allocation pays for actor '3c446b40'" });
  const forbidden: Reading<Allowance> = broken("engine", { kind: "http", status: 403, detail: "jobs.read required" });
  const down: Reading<Allowance> = broken("engine");

  it("says so before a run is refused, naming the actor id an operator must provision", () => {
    expect(allocationNotice(none, "3c446b40")).toEqual({ actorId: "3c446b40", message: expect.stringContaining("no allocation yet") });
  });

  it("says nothing when the allocation exists or the read failed for another reason", () => {
    expect(allocationNotice(read("engine", {} as Allowance), "3c446b40")).toBeNull();
    expect(allocationNotice(forbidden, "3c446b40")).toBeNull();
    expect(allocationNotice(down, "3c446b40")).toBeNull();
  });
});

describe("my jobs", () => {
  it("says why a job failed in plain words, with the engine's reason, message and what to do (builder-core D58)", () => {
    const failed = {
      id: "j",
      app: "blueclaw/chat/qwen3.8-27b",
      state: "failed",
      created_at: NOW.toISOString(),
      attempts: [],
      failure: { kind: "payment", reason: "allowance_exhausted", message: "the signer refused payment: allowance exhausted (HTTP 402)", payment_sent: false },
    } as unknown as Job;
    expect(jobRow(failed).failure).toEqual({
      title: "Payment refused: the allocation is spent",
      code: "payment · allowance_exhausted",
      message: "the signer refused payment: allowance exhausted (HTTP 402)",
      todo: "An operator funds the allocation; then the same operation reference runs again.",
    });
    expect(jobRow({ ...failed, failure: null }).failure).toBeNull();
  });
});

describe("the FLUX schnell preset", () => {
  it("asks for the image inline (sync_mode), so the result outlives the provider's URL (builder-core D59, ISS-15 Q1)", () => {
    const image = PRESETS.find((preset) => preset.id === "image");
    expect(image?.app).toBe("comfystream/fal-flux-schnell");
    expect(image?.input).toMatchObject({ sync_mode: true });
  });
});

describe("my cost per app and class (builder-core D60)", () => {
  const fees = (usd: string, eth: string, rows: number): Fees => ({ fee_usd: usd, fee_eth: eth, row_count: rows });
  const window = { start: "2026-10-13T18:00:00Z", end: "2026-10-20T18:00:00Z" };
  const allowance = read("engine", {} as Allowance);
  const summary = (overrides: Partial<CostSummary>): Reading<CostSummary> =>
    read("engine", {
      start: window.start,
      end: window.end,
      by_class: { delivered: fees("0.003118", "0.0000011", 2), pending: fees("0.000111", "0.0000001", 1) },
      jobs_with_cost: 3,
      jobs_pending: 1,
      by_app: {
        "blueclaw/chat/qwen3.8-27b": { delivered: fees("0.000111", "0.0000001", 1), pending: fees("0.000111", "0.0000001", 1) },
        "comfystream/fal-flux-schnell": { delivered: fees("0.003007", "0.000001", 1) },
      },
      ...overrides,
    } as CostSummary);

  it("lists each app with its final classes and pending kept apart, most final spend first", () => {
    const view = usage(allowance, summary({}), window);
    expect(view.apps.map((row) => row.app)).toEqual(["comfystream/fal-flux-schnell", "blueclaw/chat/qwen3.8-27b"]);
    const chat = view.apps[1];
    expect(chat?.classes.map((cell) => cell.costClass)).toEqual(["delivered", "failed_after_payment", "uncertain", "pending"]);
    expect(chat?.classes.find((cell) => cell.costClass === "pending")?.fees?.fee_usd).toBe("0.000111");
    expect(chat?.classes.find((cell) => cell.costClass === "uncertain")?.fees).toBeNull();
    expect(view.appsUnbalanced).toEqual([]);
  });

  it("names a class whose apps do not add up to its total, rather than hiding it", () => {
    const view = usage(allowance, summary({ by_class: { delivered: fees("0.004", "0.0000012", 3), pending: fees("0.000111", "0.0000001", 1) } }), window);
    expect(view.appsUnbalanced).toEqual(["delivered"]);
  });

  it("shows no apps when the summary has none or could not be read", () => {
    expect(usage(allowance, summary({ by_app: {} }), window).apps).toEqual([]);
    expect(usage(allowance, broken("engine"), window).apps).toEqual([]);
  });
});
