import { describe, expect, it } from "vitest";

import type { AccessKey, Job } from "@/domain/engine";
import type { Reading } from "@/domain/reading";
import { broken, read } from "../../tests/support/fixtures";

import { classifyKey, classifyPerson, standing } from "./signin";

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

describe("a key session ending (ISS-21)", () => {
  const session = { expiresAt: "2026-10-30T20:00:00.000Z" };
  const now = new Date("2026-10-30T12:00:00.000Z");

  it("ends the session with a clear message when the engine answers 401 to its key", () => {
    expect(standing(session, broken("engine", { kind: "http", status: 401, detail: "invalid or revoked API key" }), now)).toEqual({
      ended: true,
      reason: "refused",
      message: "The engine no longer accepts this key: it was revoked or it expired. Sign in again with a valid key.",
    });
  });

  it("keeps the session when the key works, lacks a permission (403), or the engine is down or failing", () => {
    expect(standing(session, read("engine", []), now)).toEqual({ ended: false });
    expect(standing(session, broken("engine", { kind: "http", status: 403, detail: "jobs.read required" }), now)).toEqual({ ended: false });
    expect(standing(session, broken("engine", { kind: "http", status: 500, detail: "internal error" }), now)).toEqual({ ended: false });
    expect(standing(session, broken("engine", { kind: "http", status: 503, detail: "not ready" }), now)).toEqual({ ended: false });
    expect(standing(session, broken("engine", { kind: "unreachable", detail: "ECONNREFUSED" }), now)).toEqual({ ended: false });
    expect(standing(session, broken("engine", { kind: "unexpected", detail: "not JSON" }), now)).toEqual({ ended: false });
    expect(standing(session, null, now)).toEqual({ ended: false });
  });

  it("still ends a session whose 8 hours ran out, whatever the engine says", () => {
    const later = new Date("2026-10-30T20:00:00.000Z");
    expect(standing(session, read("engine", []), later)).toMatchObject({ ended: true, reason: "expired", message: expect.stringContaining("8 hours") });
    expect(standing(session, null, later)).toMatchObject({ ended: true, reason: "expired" });
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
