import { describe, expect, it } from "vitest";

import { needsRefresh, viewOf, type Session } from "./session";

const base: Session = {
  area: "builder",
  token: "eyJ.access.token",
  kind: "actor",
  actorId: "0032bc7b",
  applicationId: null,
  prefix: "alice",
  signedInAt: "2026-10-26T12:00:00.000Z",
  expiresAt: "2026-10-26T20:00:00.000Z",
  via: "oidc",
  name: "alice",
  refreshToken: "eyJ.refresh.token",
  tokenExpiresAt: "2026-10-26T12:05:00.000Z",
};

describe("sessions", () => {
  it("refreshes an identity-provider token a minute before it expires, never a key", () => {
    expect(needsRefresh(base, new Date("2026-10-26T12:03:59.000Z"))).toBe(false);
    expect(needsRefresh(base, new Date("2026-10-26T12:04:00.000Z"))).toBe(true);
    const key: Session = { ...base, via: "key", refreshToken: null, tokenExpiresAt: null };
    expect(needsRefresh(key, new Date("2026-10-26T19:00:00.000Z"))).toBe(false);
  });

  it("never lets a page see the access or refresh token", () => {
    const view = viewOf(base) as Record<string, unknown>;
    expect(view.token).toBeUndefined();
    expect(view.refreshToken).toBeUndefined();
    expect(view).toMatchObject({ via: "oidc", name: "alice", actorId: "0032bc7b" });
  });
});
