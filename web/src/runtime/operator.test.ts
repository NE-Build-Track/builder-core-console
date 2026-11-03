import { afterEach, describe, expect, it, vi } from "vitest";

import type { Session } from "@/domain/session";

import { commitAction } from "./operator";

const send = vi.hoisted(() =>
  vi.fn(async () => ({
    ok: true as const,
    value: null,
    replayed: false,
    exchange: { method: "POST" as const, path: "/v1/admin/grants", status: 201, at: "2026-10-30T00:00:00Z", ms: 1 },
  })),
);

vi.mock("@/adapters/engine/writer", () => ({
  engineWriter: () => ({ send }),
}));

const session: Session = {
  area: "operator",
  token: "operator-token",
  kind: "admin",
  actorId: null,
  applicationId: null,
  prefix: "oidc…",
  signedInAt: "2026-10-30T00:00:00Z",
  expiresAt: "2026-10-30T08:00:00Z",
  via: "oidc",
  name: "Operator",
  refreshToken: null,
  tokenExpiresAt: null,
};

function operatorForm(): FormData {
  const form = new FormData();
  form.set("action", "provisionOperator");
  form.set("subject", "ada");
  form.set("email", "ada@example.com");
  form.set("label", "Ada");
  return form;
}

describe("commitAction", () => {
  afterEach(() => {
    send.mockReset();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("adds an operator in Auth0 and does not send an engine request", async () => {
    vi.stubEnv("CONSOLE_ENGINE_URL", "http://engine:8080");
    vi.stubEnv("CONSOLE_ENGINE_ADMIN_TOKEN", "lpk_admin");
    vi.stubEnv("CONSOLE_AUTH0_DOMAIN", "tenant.example.auth0.com");
    vi.stubEnv("CONSOLE_AUTH0_MGMT_CLIENT_ID", "mgmt");
    vi.stubEnv("CONSOLE_AUTH0_MGMT_CLIENT_SECRET", "secret");
    vi.stubEnv("CONSOLE_AUTH0_BUILDER_ROLE_ID", "rol_builder");
    vi.stubEnv("CONSOLE_AUTH0_OPERATOR_ROLE_ID", "rol_operator");
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("engine:8080")) return new Response("engine", { status: 500 });
      if (url.endsWith("/oauth/token")) return Response.json({ access_token: "mgmt-token" });
      if (url.endsWith("/api/v2/users")) return Response.json({ user_id: "auth0|ada" }, { status: 201 });
      if (url.endsWith("/roles")) return new Response(null, { status: 204 });
      return new Response("unexpected", { status: 500 });
    });
    const result = await commitAction(session, operatorForm());
    expect(send).not.toHaveBeenCalled();
    expect(urls.some((url) => url.includes("engine:8080"))).toBe(false);
    expect(result).toMatchObject({
      step: "done",
      ok: true,
      title: "Operator added",
      exchange: { host: "auth0", method: "POST", path: "/api/v2/users/auth0%7Cada/roles", body: { roles: ["rol_operator"] } },
    });
    const password = result.step === "done" && result.ok ? result.lines.find((line) => line.label.includes("password"))?.value : undefined;
    expect(password).toEqual(expect.any(String));
    expect(JSON.stringify(result.step === "done" && result.ok ? result.exchange : {})).not.toContain(password);
  });
});
