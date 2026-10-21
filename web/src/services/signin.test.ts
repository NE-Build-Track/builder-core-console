import { describe, expect, it } from "vitest";

import type { AccessKey, Job } from "@/domain/engine";
import type { Reading } from "@/domain/reading";
import { broken, read } from "../../tests/support/fixtures";

import { classifyKey } from "./signin";

const job = { id: "j1", actor_id: "acme", application_id: "default" } as Job;
const forbidden: Reading<readonly AccessKey[]> = broken("engine", { kind: "http", status: 403, detail: "admin.keys required" });
const unauthenticated: Reading<never[]> = broken("engine", { kind: "http", status: 401, detail: "bad key" });

describe("sign-in", () => {
  it("takes an admin key for Operator actions, and refuses others", () => {
    expect(classifyKey("operator", read("engine", []), read("engine", []))).toEqual({ ok: true, identity: { kind: "admin", actorId: null, applicationId: null } });
    expect(classifyKey("operator", forbidden, read("engine", [job]))).toMatchObject({ ok: false, message: expect.stringContaining("not an admin key") });
  });

  it("takes an actor key for the Builder, naming the actor from its newest job", () => {
    expect(classifyKey("builder", forbidden, read("engine", [job]))).toEqual({ ok: true, identity: { kind: "actor", actorId: "acme", applicationId: "default" } });
    expect(classifyKey("builder", forbidden, read("engine", []))).toEqual({ ok: true, identity: { kind: "actor", actorId: null, applicationId: null } });
    expect(classifyKey("builder", read("engine", []), read("engine", []))).toMatchObject({ ok: false, message: expect.stringContaining("admin key") });
  });

  it("says when the engine does not accept the key or cannot be reached", () => {
    expect(classifyKey("builder", unauthenticated, unauthenticated)).toMatchObject({ ok: false, message: expect.stringContaining("revoked") });
    expect(classifyKey("operator", broken("engine"), broken("engine"))).toMatchObject({ ok: false, message: expect.stringContaining("could not be asked") });
  });
});
