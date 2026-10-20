import { describe, expect, it } from "vitest";

import { allocation, fakeSources, NOW, read, session, usageEvent } from "../../tests/support/fixtures";

import { bucketsOf, inWindow, summarise, tickerItems, usage } from "./usage";

const hour = 3600_000;

describe("usage", () => {
  it("keeps only events inside the window", () => {
    const events = [usageEvent({ id: "old", created_at_ms: NOW.getTime() - 8 * 24 * hour }), usageEvent({ id: "new" })];
    const window = { start: new Date(NOW.getTime() - 7 * 24 * hour).toISOString(), end: NOW.toISOString() };
    expect(inWindow(events, window).map((event) => event.id)).toEqual(["new"]);
  });

  it("joins events to sessions for app and orchestrator, and names allocations", () => {
    const events = [
      usageEvent({ id: "a" }),
      usageEvent({ id: "b" }),
      usageEvent({ id: "c", payment_session_id: "gone" }),
      usageEvent({ id: "q", status: "quarantined", computed_fee_usd: "" }),
    ];
    const summary = summarise(events, [session], [allocation]);
    expect(summary).toMatchObject({ feeUsd: "0.000334082948214396", eventCount: 3, averageFeeUsd: "0.000111360982738132" });
    expect(summary.quarantined.map((event) => event.id)).toEqual(["q"]);
    expect(summary.byApp).toEqual([
      { key: "blueclaw/chat/qwen3.8-27b", label: "blueclaw/chat/qwen3.8-27b", feeUsd: "0.000222721965476264", events: 2 },
      { key: "unknown session", label: "unknown session", feeUsd: "0.000111360982738132", events: 1 },
    ]);
    expect(summary.byOrchestrator[0]?.key).toBe("0xd00354656922168815fcd1e51cbddb9e359e3c7f");
    expect(summary.byAllocation).toEqual([{ key: allocation.id, label: "chatlpt", feeUsd: "0.000334082948214396", events: 3 }]);
  });

  it("buckets a window into equal slots, oldest first, with empty slots at zero", () => {
    const window = { start: new Date(NOW.getTime() - 24 * hour).toISOString(), end: NOW.toISOString() };
    const events = [usageEvent({ id: "b", created_at_ms: NOW.getTime() - 1 * hour + 1 }), usageEvent({ id: "a", created_at_ms: NOW.getTime() - 24 * hour })];
    const buckets = bucketsOf(events, window.start, hour, 24);
    expect(buckets).toHaveLength(24);
    expect(buckets[0]).toEqual({ start: window.start, feeUsd: "0.000111360982738132", events: 1 });
    expect(buckets[23]).toMatchObject({ events: 1 });
    expect(buckets.slice(1, 23).every((bucket) => bucket.events === 0 && bucket.feeUsd === "0")).toBe(true);
  });

  it("lists the newest applied tickets first, with their session's app", () => {
    const events = [usageEvent({ id: "old", created_at_ms: 1 }), usageEvent({ id: "q", status: "quarantined" }), usageEvent({ id: "new", created_at_ms: 2 })];
    expect(tickerItems(events, [session], 5).map((item) => [item.id, item.app])).toEqual([
      ["new", "blueclaw/chat/qwen3.8-27b"],
      ["old", "blueclaw/chat/qwen3.8-27b"],
    ]);
  });

  it("reads the engine's cost classes for the same window", async () => {
    const view = await usage(fakeSources(), "7d");
    // Seven whole UTC days ending today: the chart's last day is today.
    expect(view.window).toEqual({ start: "2026-10-14T00:00:00.000Z", end: "2026-10-20T18:00:00.000Z" });
    expect(view.buckets.map((bucket) => bucket.start.slice(0, 10))).toEqual(["2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20"]);
    expect(view.classes.map((row) => [row.costClass, row.fees?.fee_usd ?? null])).toEqual([
      ["delivered", "0.04"],
      ["failed_after_payment", "0.0049"],
      ["uncertain", null],
      ["pending", null],
    ]);
  });

  it("passes a truncated usage feed through so the page can say totals are partial", async () => {
    const view = await usage(fakeSources({ batteries: { usage: async () => read("batteries", { items: [usageEvent()], truncated: true }) } }), "24h");
    expect(view.events.ok && view.events.value.truncated).toBe(true);
  });
});
