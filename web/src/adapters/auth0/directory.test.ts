import { describe, expect, it } from "vitest";

import type { DirectorySettings } from "@/config/config";

import { ensureBuilderUser } from "./directory";

const settings: DirectorySettings = {
  domain: "tenant.example.auth0.com",
  clientId: "mgmt",
  clientSecret: "secret",
  connection: "Username-Password-Authentication",
  builderRoleId: "rol_builder",
};

describe("ensureBuilderUser", () => {
  it("creates the Auth0 user as auth0/<subject> before assigning the builder role", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ url, body });
      if (url.endsWith("/oauth/token")) return Response.json({ access_token: "mgmt-token" });
      if (url.endsWith("/api/v2/users")) return Response.json({ user_id: "auth0|carol" }, { status: 201 });
      if (url.endsWith("/roles")) return new Response(null, { status: 204 });
      return new Response("unexpected", { status: 500 });
    };
    const created = await ensureBuilderUser(settings, { subject: "carol", email: "carol@example.com", name: "Carol" }, fetchImpl);
    expect(created.userId).toBe("auth0|carol");
    expect(created.password).toEqual(expect.any(String));
    expect(calls[1]?.body).toMatchObject({ user_id: "carol", email: "carol@example.com", nickname: "carol", connection: "Username-Password-Authentication" });
    expect(calls[2]?.body).toEqual({ roles: ["rol_builder"] });
  });
});
