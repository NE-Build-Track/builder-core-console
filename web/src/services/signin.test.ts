import { describe, expect, it } from "vitest";

import type { AccessKey, Job } from "@/domain/engine";
import type { Reading } from "@/domain/reading";
import { broken, read } from "../../tests/support/fixtures";

import { classifyKey, classifyPerson } from "./signin";

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

describe("sign-in through the identity provider (CONSOLE_AUTH=oidc)", () => {
  const scopes = { operator: "livepeer:admin", builder: ["discover", "jobs.run", "jobs.read", "costs.read", "events.read"] } as const;
  const alice = { sub: "0032bc7b", name: "alice" };
  const works = read("engine", []);

  it("takes an operator when the provider granted the admin scope and the engine accepts the token", () => {
    expect(classifyPerson("operator", ["openid", "livepeer:admin"], scopes, works, alice)).toEqual({ ok: true, identity: { kind: "admin", actorId: null, applicationId: null } });
  });

  it("takes a builder as the actor its sub names: the engine's actor_id is the token's sub", () => {
    expect(classifyPerson("builder", ["openid", "jobs.run", "jobs.read"], scopes, works, alice)).toEqual({ ok: true, identity: { kind: "actor", actorId: "0032bc7b", applicationId: null } });
  });

  it("refuses a person the provider did not grant the area's scope, naming it", () => {
    expect(classifyPerson("operator", ["openid", "jobs.run"], scopes, works, alice)).toMatchObject({ ok: false, message: expect.stringContaining("livepeer:admin") });
    expect(classifyPerson("builder", ["openid", "livepeer:admin"], scopes, works, alice)).toMatchObject({ ok: false, message: expect.stringContaining("jobs.run") });
  });

  it("names the account the provider signed in, so a person still logged in as someone else sees it", () => {
    const operator = { sub: "b715dc36", name: "operator" };
    expect(classifyPerson("builder", ["openid", "livepeer:admin"], scopes, works, operator)).toMatchObject({ ok: false, message: expect.stringContaining("operator is not a builder") });
    expect(classifyPerson("operator", ["openid", "jobs.run"], scopes, works, alice)).toMatchObject({ ok: false, message: expect.stringContaining("alice is not an operator") });
  });

  it("says why the engine refused the token", () => {
    const wrongType = broken("engine", { kind: "http", status: 401, detail: "the token type 'JWT' is not an access token (at+jwt)" });
    expect(classifyPerson("builder", ["jobs.run"], scopes, wrongType, alice)).toMatchObject({ ok: false, message: expect.stringContaining("at+jwt") });
    const notAdmin = broken("engine", { kind: "http", status: 403, detail: "admin.read requires an admin credential" });
    expect(classifyPerson("operator", ["livepeer:admin"], scopes, notAdmin, alice)).toMatchObject({ ok: false, message: expect.stringContaining("admin.read") });
    expect(classifyPerson("operator", ["livepeer:admin"], scopes, broken("engine"), alice)).toMatchObject({ ok: false, message: expect.stringContaining("could not be asked") });
  });
});
