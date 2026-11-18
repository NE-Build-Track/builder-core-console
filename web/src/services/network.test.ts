import { describe, expect, it } from "vitest";

import { broken, fakeSources, NOW, orchestrator, read } from "../../tests/support/fixtures";

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
    const second = runners.ok ? { ...runners.value[0]!, url: "u2", orchestrator_url: "https://b:1", capacity: 4, capacity_available: 0, price_info: { price: "9000000000", currency: "wei", unit: "seconds" } } : null;
    const stats = offeringStats(runners.ok && second ? [...runners.value, second] : []);
    expect(stats).toEqual({ runners: 2, orchestrators: 2, free: 6, total: 12, priceLow: "4534062178", priceHigh: "9000000000", priceUnit: "wei/seconds" });
  });

  it("ranges only prices that name an amount, a currency and a unit, and counts a runner with no orchestrator_url by its URL (builder-core D63)", async () => {
    const runners = await fakeSources().engine.runners("blueclaw/chat/qwen3.8-27b");
    const first = runners.ok ? runners.value[0]! : null;
    // price_info is passed on as advertised, every field optional; orchestrator_url is absent when the address is on another origin
    const partial = first ? { ...first, url: "https://c:1/app", orchestrator_url: null, price_info: { price: "1", currency: null, unit: null } } : null;
    const unpriced = first ? { ...first, url: "https://d:1/app", orchestrator_url: undefined, price_info: null } : null;
    const stats = offeringStats(first && partial && unpriced ? [first, partial, unpriced] : []);
    expect(stats).toMatchObject({ runners: 3, orchestrators: 3, priceLow: "4534062178", priceHigh: "4534062178", priceUnit: "wei/seconds" });
  });

  it("reads runners for every offered app", async () => {
    const view = await network(fakeSources());
    expect(view.apps.ok && view.apps.value.map((row) => [row.offering.app, row.runners.ok])).toEqual([["blueclaw/chat/qwen3.8-27b", true]]);
    expect(view.totals).toEqual({ apps: 1, orchestrators: 1, freshOrchestrators: 0, runners: 1, free: 6, slots: 8 });
  });

  it("shows an app once when the engine lists it per currency and unit, reading its runners once (builder-core D62)", async () => {
    const sources = fakeSources();
    const listed = await sources.engine.offerings();
    const group = listed.ok ? listed.value[0]! : null;
    let reads = 0;
    const engine = {
      ...sources.engine,
      offerings: async () => read("engine", group ? [group, { ...group, ready_count: 0, runner_count: 1, rate_low: null, rate_high: null, rate_status: "missing" as const, modes: ["streaming"] }] : []),
      runners: async (app: string) => {
        reads += 1;
        return sources.engine.runners(app);
      },
    };
    const view = await network({ ...sources, engine });
    expect(view.apps.ok && view.apps.value.map((row) => [row.offering.app, row.offering.runner_count, row.offering.ready_count, row.offering.modes])).toEqual([["blueclaw/chat/qwen3.8-27b", 2, 1, ["single-shot", "streaming"]]]);
    expect(reads).toBe(1);
    expect(view.totals).toEqual({ apps: 1, orchestrators: 1, freshOrchestrators: 0, runners: 1, free: 6, slots: 8 });
  });

  it("still shows orchestrators when the engine is down", async () => {
    const view = await network(fakeSources({ engine: { offerings: async () => broken("engine") } }));
    expect(view.apps.ok).toBe(false);
    expect(view.orchestrators.ok).toBe(true);
  });
});
