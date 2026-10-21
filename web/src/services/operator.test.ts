import { describe, expect, it } from "vitest";

import { callOf } from "@/domain/operator";
import { read } from "../../tests/support/fixtures";

import { actorsFromKeys, parseAction, resultOf, reviewOf, type ReviewContext } from "./operator";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

const REF = "console-fundGrant-1234abcd";
const context: ReviewContext = {
  grants: read("engine", [{ id: "g1", name: "Pilot", status: "active", currency: "USD", total: "1.5" }]),
  allowance: read("engine", { allocation_id: "al1", status: "active", granted: { amount: "0.25", currency: "USD" }, available: { amount: "0.2", currency: "USD" }, spent: { amount: "0.05", currency: "USD" } }),
  keys: read("engine", [
    { key_id: "k1abcdefgh", actor_id: "acme", application_id: "default", kind: "actor", label: "", permissions: [], created_at: "2026-10-21T10:00:00Z", revoked_at: null },
  ]),
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
      ...(context.keys.ok ? context.keys.value : []),
      { key_id: "k9", actor_id: "ops", application_id: "default", kind: "admin", label: "", permissions: [], created_at: "2026-10-21T10:00:00Z", revoked_at: null },
    ]);
    expect(actors).toEqual([{ applicationId: "default", actorId: "acme", activeKeys: 1, revokedKeys: 0 }]);
  });
});
