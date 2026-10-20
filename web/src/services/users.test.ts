import { describe, expect, it } from "vitest";

import { accessKey, fakeSources, read } from "../../tests/support/fixtures";

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
});
