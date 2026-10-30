import { describe, expect, it } from "vitest";

import type { DirectorySettings } from "@/config/config";

import { ensureDirectoryUser } from "./directory";

const settings: DirectorySettings = {
  domain: "tenant.example.auth0.com",
  clientId: "mgmt",
  clientSecret: "secret",
  connection: "Username-Password-Authentication",
  builderRoleId: "rol_builder",
  operatorRoleId: "rol_operator",
};

const ada = { subject: "ada", email: "ada@example.com", name: "Ada" };

describe("ensureDirectoryUser", () => {
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
    const created = await ensureDirectoryUser(settings, { subject: "carol", email: "carol@example.com", name: "Carol" }, "rol_builder", fetchImpl);
    expect(created.userId).toBe("auth0|carol");
    expect(created.password).toEqual(expect.any(String));
    expect(calls[1]?.body).toMatchObject({ user_id: "carol", email: "carol@example.com", nickname: "carol", connection: "Username-Password-Authentication" });
    expect(calls[2]?.body).toEqual({ roles: ["rol_builder"] });
  });
});

describe("ensureDirectoryUser", () => {
  it("creates auth0|ada and assigns only the given role", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const created = await ensureDirectoryUser(
      settings,
      ada,
      "rol_operator",
      async (input, init) => {
        const url = String(input);
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        calls.push({ url, body });
        if (url.endsWith("/oauth/token")) return Response.json({ access_token: "mgmt-token" });
        if (url.endsWith("/api/v2/users")) return Response.json({ user_id: "auth0|ada" }, { status: 201 });
        if (url.endsWith("/roles")) return new Response(null, { status: 204 });
        return new Response("unexpected", { status: 500 });
      },
    );
    expect(created.userId).toBe("auth0|ada");
    expect(created.password).toEqual(expect.any(String));
    expect(calls[1]?.body).toMatchObject({ user_id: "ada", email: "ada@example.com" });
    expect(calls[2]?.body).toEqual({ roles: ["rol_operator"] });
  });

  it("reuses auth0|ada and still assigns the operator role when that user already exists", async () => {
    const roles: unknown[] = [];
    const created = await ensureDirectoryUser(
      settings,
      ada,
      "rol_operator",
      async (input, init) => {
        const url = String(input);
        if (url.endsWith("/oauth/token")) return Response.json({ access_token: "mgmt-token" });
        if (url.endsWith("/api/v2/users")) return Response.json({ message: "The user already exists." }, { status: 409 });
        if (url.includes("/users-by-email")) return Response.json([{ user_id: "google-oauth2|ada" }, { user_id: "auth0|ada" }]);
        if (url.endsWith("/roles")) {
          roles.push(init?.body ? JSON.parse(String(init.body)) : null);
          return new Response(null, { status: 204 });
        }
        return new Response("unexpected", { status: 500 });
      },
    );
    expect(created).toEqual({ userId: "auth0|ada", password: null });
    expect(roles).toEqual([{ roles: ["rol_operator"] }]);
  });

  it("does not assign a role when the email belongs only to a Google user", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/oauth/token")) return Response.json({ access_token: "mgmt-token" });
      if (url.endsWith("/api/v2/users") && init?.method === "POST") return Response.json({ message: "The user already exists." }, { status: 409 });
      if (url.includes("/users-by-email")) return Response.json([{ user_id: "google-oauth2|ada" }]);
      if (url.endsWith("/roles")) return new Response(null, { status: 204 });
      return new Response("unexpected", { status: 500 });
    };
    await expect(ensureDirectoryUser(settings, ada, "rol_operator", fetchImpl)).rejects.toThrow("another Auth0 user, not auth0|ada");
    expect(calls.some((url) => url.endsWith("/roles"))).toBe(false);
  });
});
