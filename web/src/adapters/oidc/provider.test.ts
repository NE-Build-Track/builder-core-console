import { describe, expect, it } from "vitest";

import { authorizationScopes } from "./provider";

describe("authorization scopes", () => {
  it("asks for openid and profile, and for a refresh token only when configured", () => {
    expect(authorizationScopes(["livepeer:admin"], false)).toBe("openid profile livepeer:admin");
    expect(authorizationScopes(["discover", "jobs.run"], true)).toBe("openid profile offline_access discover jobs.run");
  });
});
