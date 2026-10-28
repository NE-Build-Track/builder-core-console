import { describe, expect, it } from "vitest";

import type { KnownActor } from "@/domain/engine";

import { accessKey, broken, fakeSources, read } from "../../tests/support/fixtures";

import { groupKeys, users } from "./users";

describe("users", () => {
  it("groups keys by application and actor, and lists admins apart", () => {
    const { actors, admins } = groupKeys([
      accessKey({ key_id: "k1", created_at: "2026-10-01T00:00:00Z" }),
      accessKey({ key_id: "k2", created_at: "2026-10-02T00:00:00Z", revoked_at: "2026-10-03T00:00:00Z" }),
      accessKey({ key_id: "k3", actor_id: "customer-7", application_id: "chatlpt" }),
      accessKey({ key_id: "a1", kind: "admin", actor_id: "admin" }),
    ]);
    expect(actors.map((actor) => [actor.applicationId, actor.actorId, actor.keys.map((key) => key.key_id)])).toEqual([
      ["chatlpt", "customer-7", ["k3"]],
      ["default", "customer-42", ["k2", "k1"]],
    ]);
    expect(admins.map((key) => key.key_id)).toEqual(["a1"]);
  });

  it("reads money only for the console's application (gap G9)", async () => {
    const sources = fakeSources({
      engine: { keys: async () => read("engine", [accessKey(), accessKey({ key_id: "k3", actor_id: "customer-7", application_id: "chatlpt" })]) },
    });
    const view = await users(sources);
    const rows = view.actors.ok ? view.actors.value : [];
    const other = rows.find((row) => row.applicationId === "chatlpt");
    const own = rows.find((row) => row.applicationId === "default");
    expect(other).toMatchObject({ allowance: null, costs: null });
    expect(other?.reconciliation.ok).toBe(true);
    expect(own?.allowance?.ok).toBe(true);
    expect(own?.activeKeys).toBe(1);
  });

  const known = (actor_id: string, label: string, provisioned: boolean): KnownActor =>
    ({ actor_id, application_id: "default", label, name: label, provisioned, allocation: provisioned ? { status: "active" } : null }) as KnownActor;

  it("lists the engine's actors when its keys are off (LPB_AUTH=jwt), by label", async () => {
    const sources = fakeSources({
      engine: {
        keys: async () => broken("engine", { kind: "http", status: 404, detail: "Not Found" }),
        actors: async () => read("engine", [known("3c446b40", "alice", true), known("5b1d7e90", "carol", false)]),
      },
    });
    const view = await users(sources);
    expect(view.keysOn).toBe(false);
    const rows = view.actors.ok ? view.actors.value : [];
    expect(rows.map((row) => [row.actorId, row.label, row.provisioned, row.activeKeys])).toEqual([
      ["3c446b40", "alice", true, 0],
      ["5b1d7e90", "carol", false, 0],
    ]);
    expect(view.counts.actors).toBe(2);
  });

  it("adds key holders the engine's list does not have, when keys are on", async () => {
    const sources = fakeSources({
      engine: {
        keys: async () => read("engine", [accessKey()]), // customer-42
        actors: async () => read("engine", [known("3c446b40", "alice", true)]),
      },
    });
    const view = await users(sources);
    expect(view.keysOn).toBe(true);
    const rows = view.actors.ok ? view.actors.value : [];
    expect(rows.map((row) => [row.actorId, row.label, row.activeKeys])).toEqual([
      ["3c446b40", "alice", 0],
      ["customer-42", null, 1],
    ]);
  });
});
