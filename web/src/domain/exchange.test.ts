import { describe, expect, it } from "vitest";

import { curlOf, fillPath, hideSecrets, showBody } from "./exchange";

const TOKEN = "lpk_AbCdEfGhIjKlMnOpQrStUvWxYz012345";

describe("exchange", () => {
  it("hides engine and gateway keys anywhere in a value", () => {
    expect(hideSecrets({ token: TOKEN, nested: [{ note: `use ${TOKEN} now` }], lpg: "lpg_1234567890abcdef" })).toEqual({
      token: "lpk_…(hidden)",
      nested: [{ note: "use lpk_…(hidden) now" }],
      lpg: "lpg_…(hidden)",
    });
    expect(hideSecrets(42)).toBe(42);
  });

  it("fills path templates, encoding values, with the query after", () => {
    expect(fillPath("/v1/admin/applications/{application_id}/actors/{actor_id}/allocation", { application_id: "default", actor_id: "a b" })).toBe(
      "/v1/admin/applications/default/actors/a%20b/allocation",
    );
    expect(fillPath("/v1/jobs", {}, { stream: "true" })).toBe("/v1/jobs?stream=true");
  });

  it("writes curl with the key as a variable and the body single-quoted", () => {
    const curl = curlOf({ method: "POST", path: "/v1/admin/grants", body: { name: "Bob's grant", token: TOKEN } });
    expect(curl).toContain('curl -sS -X POST "$ENGINE_URL/v1/admin/grants"');
    expect(curl).toContain('-H "Authorization: Bearer $LPB_KEY"');
    expect(curl).toContain(`-d '{"name":"Bob'\\''s grant","token":"lpk_…(hidden)"}'`);
    expect(curl).not.toContain(TOKEN);
    expect(curlOf({ method: "POST", path: "/v1/admin/keys/k1/revoke" })).not.toContain("-d ");
  });

  it("writes an Auth0 role assignment against the tenant, not the engine", () => {
    const curl = curlOf({
      method: "POST",
      path: "/api/v2/users/auth0%7Cada/roles",
      body: { roles: ["rol_operator"] },
      host: "auth0",
    });
    expect(curl).toContain('curl -sS -X POST "https://$AUTH0_DOMAIN/api/v2/users/auth0%7Cada/roles"');
    expect(curl).toContain('-H "Authorization: Bearer $AUTH0_MGMT_TOKEN"');
    expect(curl).not.toContain("$ENGINE_URL");
    expect(curl).not.toContain("$LPB_KEY");
  });

  it("shows bodies as pretty JSON with keys hidden", () => {
    expect(showBody({ token: TOKEN })).toBe('{\n  "token": "lpk_…(hidden)"\n}');
    expect(showBody(undefined)).toBe("");
  });
});
