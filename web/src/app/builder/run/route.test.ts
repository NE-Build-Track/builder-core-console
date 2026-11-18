import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Session } from "@/domain/session";

const calls = vi.hoisted(() => ({ session: vi.fn(), run: vi.fn(), ended: vi.fn() }));
vi.mock("@/app/session-cookies", () => ({ sessionFor: calls.session, endedBy: calls.ended }));
vi.mock("@/runtime/builder", () => ({ startRun: calls.run }));

import { POST } from "./route";

const publicOrigin = "https://console.example.com";
const good = { app: "fixture/app", path: "/v1/chat/completions", method: "POST", payload: { messages: [] }, stream: true, timeoutS: 120, maxAttempts: 2, operationRef: "console-run-1234abcd" };

function request(origin: string | null, forwardedHost = "console.example.com, console.example.com") {
  return new Request("http://console:3000/builder/run", {
    method: "POST", body: JSON.stringify(good),
    headers: { ...(origin === null ? {} : { origin }), "x-forwarded-host": forwardedHost, "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.stubEnv("CONSOLE_AUTH", "oidc");
  vi.stubEnv("CONSOLE_OIDC_ISSUER", "https://issuer.example.com/realms/livepeer");
  vi.stubEnv("CONSOLE_OIDC_CLIENT_ID", "fixture-client");
  vi.stubEnv("CONSOLE_OIDC_CLIENT_SECRET", "fixture-secret");
  vi.stubEnv("CONSOLE_OIDC_REDIRECT_URL", publicOrigin + "/auth/callback");
  calls.session.mockResolvedValue(null);
});
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

describe("Builder run origin behind HTTPS termination", () => {
  it("accepts the registered origin despite an internal HTTP URL and duplicate forwarded hosts", async () => {
    const response = await POST(request(publicOrigin));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ problem: "Your builder session ended. Sign in again." });
    expect(calls.session).toHaveBeenCalledWith("builder");
    expect(calls.run).not.toHaveBeenCalled();
  });

  it.each([null, "null", "malformed", "http://console.example.com", "https://evil.example.com", "https://console.example.com/other"])("rejects %s before reading a session or starting a job", async (origin) => {
    expect((await POST(request(origin, "evil.example.com"))).status).toBe(403);
    expect(calls.session).not.toHaveBeenCalled();
    expect(calls.run).not.toHaveBeenCalled();
  });

  it("passes the signed-in builder and validated request to the engine adapter", async () => {
    const session: Session = {
      area: "builder", kind: "actor", token: "fixture-token", actorId: "fixture-actor", applicationId: "default",
      prefix: "fixture", signedInAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(),
      via: "oidc", name: "Fixture", refreshToken: null, tokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    calls.session.mockResolvedValue(session);
    calls.run.mockResolvedValue({ ok: true, status: 200, contentType: "application/json", jobId: "fixture-job", body: new Response('{"fixture":true}').body });
    const response = await POST(request(publicOrigin));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ fixture: true });
    expect(response.headers.get("x-job-id")).toBe("fixture-job");
    expect(calls.run).toHaveBeenCalledWith(session, good, expect.any(AbortSignal));
  });

  it("keeps direct local key-mode requests working", async () => {
    vi.stubEnv("CONSOLE_AUTH", "keys");
    const local = new Request("http://127.0.0.1:3060/builder/run", { method: "POST", headers: { origin: "http://127.0.0.1:3060" } });
    expect((await POST(local)).status).toBe(401);
    expect(calls.session).toHaveBeenCalledWith("builder");
  });
});
