import { describe, expect, it } from "vitest";

import { broken, engineHealth, fakeSources, healthyMetrics, read, reconciliation } from "../../tests/support/fixtures";

import { stackHealth, worst } from "./stack-health";

const stateOf = async (sources: ReturnType<typeof fakeSources>, id: string) => {
  const health = await stackHealth(sources);
  return health.components.flatMap((component) => component.checks).find((check) => check.id === id);
};

describe("stack health", () => {
  it("is healthy when every source reads well", async () => {
    const health = await stackHealth(fakeSources());
    expect(health.state).toBe("ok");
    expect(health.components.map((component) => component.state)).toEqual(["ok", "ok", "ok"]);
  });

  it("marks an unreachable engine down and names why", async () => {
    const health = await stackHealth(fakeSources({ engine: { health: async () => broken("engine") } }));
    expect(health.components[0]).toMatchObject({ component: "engine", state: "bad" });
    expect(health.components[0]?.checks[0]?.summary).toBe("unreachable: connect ECONNREFUSED");
    expect(health.state).toBe("bad");
  });

  it("degrades on stale discovery and stale or failed cost sync", async () => {
    const stale = fakeSources({
      engine: {
        health: async () =>
          read("engine", engineHealth({ discovery_fresh: false, discovery_error: "signer unreachable", cost_sync_at: "2026-10-20T17:00:00Z" })),
      },
    });
    expect(await stateOf(stale, "engine.discovery")).toMatchObject({ state: "warn", summary: expect.stringContaining("signer unreachable") });
    expect(await stateOf(stale, "engine.cost_sync")).toMatchObject({ state: "warn", summary: "Synced 1 h ago" });
    const failing = fakeSources({ engine: { health: async () => read("engine", engineHealth({ cost_sync_error: "Batteries 401" })) } });
    expect(await stateOf(failing, "engine.cost_sync")).toMatchObject({ state: "warn", summary: "Last sync failed: Batteries 401" });
  });

  it("does not call a never-synced engine healthy", async () => {
    const sources = fakeSources({ engine: { health: async () => read("engine", engineHealth({ cost_sync_at: null })) } });
    expect(await stateOf(sources, "engine.cost_sync")).toMatchObject({ state: "unknown" });
  });

  it("flags an engine that is not the pinned build", async () => {
    const sources = fakeSources({ engine: { health: async () => read("engine", engineHealth({ version: "0.0.0" })) } });
    expect(await stateOf(sources, "engine.version")).toMatchObject({ state: "warn", summary: expect.stringContaining("a89216d") });
  });

  it("reports a signer that cannot pay as down, with its reason", async () => {
    const sources = fakeSources({
      signer: { readiness: async () => read("signer", { ready: false, detail: "signer payment dependencies unavailable" }) },
    });
    expect(await stateOf(sources, "signer.ready")).toMatchObject({ state: "bad", summary: "Cannot pay: signer payment dependencies unavailable" });
  });

  it("grades the accounting outbox by backlog age", async () => {
    const backlog = (age: number) =>
      fakeSources({
        signer: {
          metrics: async () =>
            read("signer", { ...healthyMetrics, livepeer_signer_kafka_pending_events: 3, livepeer_signer_kafka_oldest_event_age_seconds: age }),
        },
      });
    expect(await stateOf(backlog(20), "signer.outbox")).toMatchObject({ state: "warn", summary: "3 events waiting for Batteries, oldest 20 s" });
    expect(await stateOf(backlog(900), "signer.outbox")).toMatchObject({ state: "bad" });
  });

  it("in per_actor mode, sums every actor's reconciliation", async () => {
    const calls: (string | undefined)[] = [];
    const sources = fakeSources({
      engine: {
        reconciliation: async ({ actorId }) => {
          calls.push(actorId);
          return actorId === "customer-42"
            ? read("engine", reconciliation({ actor_id: "customer-42", balanced: false, unattributed: { fee_eth: "0", fee_usd: "0.0012", row_count: 2 } }))
            : read("engine", reconciliation({ actor_id: actorId ?? null }));
        },
      },
    });
    expect(await stateOf(sources, "batteries.balanced")).toMatchObject({
      state: "warn",
      summary: expect.stringContaining("actor customer-42 has 0.0012 USD"),
    });
    expect(calls).toEqual(["customer-42"]);
  });

  it("reads Batteries running ahead of the cost sync as catching up, not a problem", async () => {
    const lag = reconciliation({
      actor_id: "customer-42",
      balanced: false,
      provider_spent: { amount: "0.003096035786184628", currency: "USD" },
      by_class: { delivered: { fee_eth: "0", fee_usd: "0.002985463079535177", row_count: 27 } },
    });
    const sources = fakeSources({ engine: { reconciliation: async () => read("engine", lag) } });
    expect(await stateOf(sources, "batteries.balanced")).toMatchObject({
      state: "ok",
      summary: "Catching up: Batteries is 0.000110572706649451 USD ahead of the last cost sync on 1 of 1 allocations, nothing unattributed",
    });
  });

  it("warns when the engine attributes more than Batteries charged", async () => {
    const ahead = reconciliation({ balanced: false, provider_spent: { amount: "0.001", currency: "USD" }, by_class: { delivered: { fee_eth: "0", fee_usd: "0.002", row_count: 2 } } });
    const sources = fakeSources({ engine: { reconciliation: async () => read("engine", ahead) } });
    expect(await stateOf(sources, "batteries.balanced")).toMatchObject({ state: "warn", summary: expect.stringContaining("attributes more than Batteries charged") });
  });

  it("is balanced when every actor balances", async () => {
    expect(await stateOf(fakeSources(), "batteries.balanced")).toMatchObject({ state: "ok", summary: "Balanced" });
  });

  it("in per_application mode, reconciles the application once", async () => {
    const calls: (string | undefined)[] = [];
    const sources = fakeSources({
      engine: {
        health: async () => read("engine", engineHealth({ allocation_mode: "per_application" })),
        reconciliation: async ({ actorId }) => {
          calls.push(actorId);
          return read("engine", reconciliation());
        },
      },
    });
    expect(await stateOf(sources, "batteries.balanced")).toMatchObject({ state: "ok" });
    expect(calls).toEqual([undefined]);
  });

  it("reads a 404 reconciliation as nothing to reconcile yet, not a failure", async () => {
    const sources = fakeSources({
      engine: {
        health: async () => read("engine", engineHealth({ allocation_mode: "per_application" })),
        reconciliation: async () => broken("engine", { kind: "http", status: 404, detail: "no allocation pays for that actor or application" }),
      },
    });
    expect(await stateOf(sources, "batteries.balanced")).toMatchObject({ state: "unknown", summary: expect.stringContaining("nothing to reconcile") });
  });

  it("ranks states bad > warn > unknown > ok", () => {
    expect(worst(["ok", "unknown"])).toBe("unknown");
    expect(worst(["unknown", "warn", "ok"])).toBe("warn");
    expect(worst(["warn", "bad"])).toBe("bad");
    expect(worst([])).toBe("ok");
  });
});
