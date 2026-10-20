import { describe, expect, it } from "vitest";

import { broken, fakeSources, NOW, orchestrator } from "../../tests/support/fixtures";

import { network, offeringStats, orchestratorViews } from "./network";

describe("network", () => {
  it("summarises each discovered orchestrator", () => {
    expect(orchestratorViews([orchestrator], NOW)).toEqual([
      {
        address: "https://orch-us-central.xodeapp.xyz:18935",
        lastSeen: "2026-10-20T17:33:02.784512125Z",
        stale: true,
        runners: 1,
        capacity: 8,
        capacityAvailable: 8,
        apps: ["blueclaw/chat/qwen3.8-27b"],
      },
    ]);
  });

  it("marks an orchestrator seen in the last minute as fresh", () => {
    const fresh = { ...orchestrator, last_seen: new Date(NOW.getTime() - 20_000).toISOString() };
    expect(orchestratorViews([fresh], NOW)[0]?.stale).toBe(false);
  });

  it("summarises an offering's runners: orchestrators, slots and price range", async () => {
    const runners = await fakeSources().engine.runners("blueclaw/chat/qwen3.8-27b");
    const second = runners.ok ? { ...runners.value[0]!, url: "u2", orchestrator_url: "https://b:1", capacity: 4, capacity_available: 0, rate: { amount: "9000000000", currency: "wei", unit: "seconds" } } : null;
    const stats = offeringStats(runners.ok && second ? [...runners.value, second] : []);
    expect(stats).toEqual({ runners: 2, orchestrators: 2, free: 6, total: 12, priceLow: "4534062178", priceHigh: "9000000000", priceUnit: "wei/seconds" });
  });

  it("reads runners for every offered app", async () => {
    const view = await network(fakeSources());
    expect(view.apps.ok && view.apps.value.map((row) => [row.offering.app, row.runners.ok])).toEqual([["blueclaw/chat/qwen3.8-27b", true]]);
    expect(view.totals).toEqual({ apps: 1, orchestrators: 1, freshOrchestrators: 0, runners: 1, free: 6, slots: 8 });
  });

  it("still shows orchestrators when the engine is down", async () => {
    const view = await network(fakeSources({ engine: { offerings: async () => broken("engine") } }));
    expect(view.apps.ok).toBe(false);
    expect(view.orchestrators.ok).toBe(true);
  });
});
