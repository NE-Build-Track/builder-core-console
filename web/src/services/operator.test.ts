import { describe, expect, it } from "vitest";

import type { AccessKey, KnownActor } from "@/domain/engine";
import { callOf } from "@/domain/operator";
import { read } from "../../tests/support/fixtures";

import { actorsFromKeys, actorsOf, parseAction, resultOf, reviewOf, type ReviewContext } from "./operator";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

const REF = "console-fundGrant-1234abcd";
const ACME_KEY: AccessKey = { key_id: "k1abcdefgh", actor_id: "acme", application_id: "default", kind: "actor", label: "ci", permissions: ["jobs.run"], created_at: "2026-10-21T10:00:00Z", revoked_at: null };
const context: ReviewContext = {
  grants: read("engine", [{ id: "g1", name: "Pilot", status: "active", currency: "USD", total: "1.5" }]),
  allowance: read("engine", { allocation_id: "al1", status: "active", granted: { amount: "0.25", currency: "USD" }, available: { amount: "0.2", currency: "USD" }, spent: { amount: "0.05", currency: "USD" } }),
  unallocated: { g1: "0.3" },
  key: read("engine", ACME_KEY),
};

describe("operator actions", () => {
  it("parses each form into one action, or names the field that is wrong", () => {
    expect(parseAction(form({ action: "fundGrant", grant_id: "g1", amount: "0.5", operation_ref: REF }))).toEqual({
      ok: true,
      value: { action: "fundGrant", grantId: "g1", amount: "0.5", operationRef: REF },
    });
    expect(parseAction(form({ action: "fundGrant", grant_id: "g1", amount: "0", operation_ref: REF }))).toMatchObject({ ok: false, field: "amount" });
    expect(parseAction(form({ action: "fundGrant", grant_id: "g1", amount: "1", operation_ref: "" }))).toMatchObject({ ok: false, field: "operation_ref" });
    expect(parseAction(form({ action: "provision", application_id: "default", actor_id: "a/b", grant_id: "g1", amount: "1" }))).toMatchObject({ ok: false, field: "actor_id" });
    expect(parseAction(form({ action: "deleteEverything" }))).toMatchObject({ ok: false, field: "action" });
  });

  it("plans the exact engine call the review shows and the writer sends", () => {
    expect(callOf({ action: "fundGrant", grantId: "g1", amount: "0.5", operationRef: REF })).toEqual({
      method: "POST",
      template: "/v1/admin/grant/fund",
      path: "/v1/admin/grant/fund",
      body: { grant_id: "g1", amount: { amount: "0.5", currency: "USD" }, operation_ref: REF },
    });
    expect(callOf({ action: "revokeKey", keyId: "k1" })).toEqual({ method: "POST", template: "/v1/admin/keys/{key_id}/revoke", path: "/v1/admin/keys/k1/revoke" });
  });

  it("shows money moves as before → after", () => {
    const fund = reviewOf({ action: "fundGrant", grantId: "g1", amount: "0.5", operationRef: REF }, context);
    expect(fund.lines).toContainEqual({ label: "Total", before: "$1.50", after: "$2.00" });
    expect(fund.button).toBe("Fund $0.50");
    expect(fund.warnings).toEqual([]);
    const allocation = reviewOf({ action: "fundAllocation", applicationId: "default", actorId: "acme", grantId: "", amount: "0.25", operationRef: REF }, context);
    expect(allocation.lines).toContainEqual({ label: "Available", before: "$0.20", after: "$0.45" });
  });

  it("warns when a repeat would apply twice", () => {
    const review = reviewOf({ action: "createGrant", name: "Pilot", amount: "5" }, context);
    expect(review.warnings.join(" ")).toContain("would apply it twice");
  });

  it("asks for a typed confirmation before anything that cannot be undone", () => {
    expect(reviewOf({ action: "revokeKey", keyId: "k1abcdefgh" }, context).confirm).toMatchObject({ expect: "k1abcdef" });
    expect(reviewOf({ action: "revokeAllocation", applicationId: "default", actorId: "acme" }, context).confirm).toMatchObject({ expect: "acme" });
    expect(reviewOf({ action: "setStatus", applicationId: "default", actorId: "acme", status: "paused" }, context).confirm).toBeNull();
  });

  it("returns a new key once, apart from the response", () => {
    const issued = resultOf(
      { action: "issueKey", actorId: "acme", applicationId: "default", kind: "actor", label: "" },
      { key: { key_id: "k2", actor_id: "acme", application_id: "default", kind: "actor" }, token: "lpk_AbCdEfGhIjKlMnOpQrSt" },
    );
    expect(issued.secret).toEqual({ token: "lpk_AbCdEfGhIjKlMnOpQrSt", keyId: "k2", actorId: "acme", kind: "actor" });
  });

  it("lists actors from their keys, never admin keys", () => {
    const actors = actorsFromKeys([
      ACME_KEY,
      { key_id: "k9", actor_id: "ops", application_id: "default", kind: "admin", label: "", permissions: [], created_at: "2026-10-21T10:00:00Z", revoked_at: null },
    ]);
    expect(actors).toEqual([{ applicationId: "default", actorId: "acme", activeKeys: 1, revokedKeys: 0 }]);
  });

  it("lists every known actor with its label, provisioned or not (builder-core #69, D48)", () => {
    const alice = { actor_id: "3c446b40", application_id: "default", label: "alice", name: "alice", provisioned: false, allocation: null } as KnownActor;
    const bob = {
      actor_id: "14a5c7ce",
      application_id: "default",
      label: "Bob B.",
      name: "bob",
      provisioned: true,
      allocation: { status: "active" },
    } as KnownActor;
    const actors = actorsOf(read("engine", [alice, bob]), [ACME_KEY]);
    expect(actors).toEqual([
      { applicationId: "default", actorId: "14a5c7ce", label: "Bob B.", name: "bob", status: "active", provisioned: true, activeKeys: 0, revokedKeys: 0 },
      { applicationId: "default", actorId: "3c446b40", label: "alice", name: "alice", status: null, provisioned: false, activeKeys: 0, revokedKeys: 0 },
      { applicationId: "default", actorId: "acme", label: null, name: null, status: null, provisioned: null, activeKeys: 1, revokedKeys: 0 },
    ]);
  });

  it("lists the known actors alone when engine keys are off (CONSOLE_AUTH=oidc)", () => {
    const paused = { actor_id: "0032bc7b", application_id: "default", label: "", name: null, provisioned: true, allocation: { status: "paused" } } as KnownActor;
    expect(actorsOf(read("engine", [paused]), null)).toEqual([
      { applicationId: "default", actorId: "0032bc7b", label: null, name: null, status: "paused", provisioned: true, activeKeys: 0, revokedKeys: 0 },
    ]);
  });

  it("sends a label only when one is given, so the key keeps its own", () => {
    const template = "/v1/admin/keys/{key_id}/rotate";
    expect(callOf({ action: "rotateKey", keyId: "k1", label: "" })).toEqual({ method: "POST", template, path: "/v1/admin/keys/k1/rotate" });
    expect(callOf({ action: "rotateKey", keyId: "k1", label: "ci-2" })).toEqual({ method: "POST", template, path: "/v1/admin/keys/k1/rotate", body: { label: "ci-2" } });
  });

  it("reviews the key as the engine shows it now, and says the old one stops at once", () => {
    const review = reviewOf({ action: "rotateKey", keyId: "k1abcdefgh", label: "" }, context);
    expect(review.kind).toBe("secret");
    expect(review.lines).toContainEqual({ label: "Belongs to", value: "acme in default (actor)", mono: true });
    expect(review.lines).toContainEqual({ label: "Permissions", value: "jobs.run" });
    expect(review.lines).toContainEqual({ label: "Label", before: "ci", after: "ci" });
    expect(review.lines.map((line) => line.value ?? "").join(" ")).toContain("fail at once with 401");
    expect(review.button).toBe("Rotate the key");
    const revoked = reviewOf({ action: "rotateKey", keyId: "k1abcdefgh", label: "" }, { ...context, key: read("engine", { ...ACME_KEY, revoked_at: "2026-10-22T10:00:00Z" }) });
    expect(revoked.warnings.join(" ")).toContain("already revoked");
  });

  it("shows the revoke review from the inspected key too", () => {
    const review = reviewOf({ action: "revokeKey", keyId: "k1abcdefgh" }, context);
    expect(review.lines).toContainEqual({ label: "Belongs to", value: "acme in default (actor)", mono: true });
  });

  it("returns the new key once, naming the key it replaced", () => {
    const rotated = resultOf(
      { action: "rotateKey", keyId: "k1abcdefgh", label: "" },
      { key: { key_id: "k2", actor_id: "acme", application_id: "default", kind: "actor" }, token: "lpk_NewNewNewNewNewNewNew" },
    );
    expect(rotated.secret).toEqual({ token: "lpk_NewNewNewNewNewNewNew", keyId: "k2", actorId: "acme", kind: "actor" });
    expect(rotated.lines).toContainEqual({ label: "Replaces", value: "k1abcdefgh (revoked)", mono: true });
  });
});

describe("drawing on a grant", () => {
  it("shows the grant's unallocated balance and warns before the engine would refuse", () => {
    const fits = reviewOf({ action: "provision", applicationId: "default", actorId: "acme", grantId: "g1", amount: "0.25", label: "" }, context);
    expect(fits.lines).toContainEqual({ label: "Grant unallocated", before: "$0.30", after: "$0.05" });
    expect(fits.warnings.join(" ")).not.toContain("refuse");
    const short = reviewOf({ action: "provision", applicationId: "default", actorId: "acme", grantId: "g1", amount: "0.5", label: "" }, context);
    expect(short.warnings.join(" ")).toContain("will refuse this (409)");
  });
});
