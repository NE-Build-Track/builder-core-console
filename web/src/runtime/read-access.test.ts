import { afterEach, describe, expect, it, vi } from "vitest";

import { seal } from "@/adapters/seal";
import type { Session } from "@/domain/session";

const probe = vi.hoisted(() => vi.fn());
vi.mock("@/adapters/engine/keyed", () => ({ keyedEngine: () => ({ adminActors: probe }) }));

import { operatorReadAccess } from "./session";

const secret = "s".repeat(48);
function cookie(overrides: Partial<Session> = {}) {
  return seal(secret, {
    area: "operator", kind: "admin", token: "token", actorId: null, applicationId: null,
    prefix: "operator", name: "Operator", via: "oidc", refreshToken: "refresh",
    signedInAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    tokenExpiresAt: new Date(Date.now() + 300_000).toISOString(), ...overrides,
  } satisfies Session);
}

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("production stack reads", () => {
  function production() {
    vi.stubEnv("CONSOLE_PROTECT_READS", "true");
    vi.stubEnv("CONSOLE_SESSION_SECRET", secret);
    vi.stubEnv("CONSOLE_ENGINE_URL", "http://engine:8080");
    vi.stubEnv("CONSOLE_ENGINE_READER_TOKEN", "reader");
  }

  it("preserves local read access by default", async () => {
    vi.stubEnv("CONSOLE_PROTECT_READS", "");
    expect(await operatorReadAccess(undefined)).toBe(true);
    expect(probe).not.toHaveBeenCalled();
  });

  it("refuses anonymous, tampered, builder and expired sessions without reading the engine", async () => {
    production();
    for (const value of [undefined, "tampered", cookie({ area: "builder", kind: "actor" }), cookie({ expiresAt: "2020-01-01" }), cookie({ tokenExpiresAt: "2020-01-01" })]) {
      expect(await operatorReadAccess(value)).toBe(false);
    }
    expect(probe).not.toHaveBeenCalled();
  });

  it("requires the engine to accept the operator token and fails closed on errors", async () => {
    production();
    for (const problem of [{ kind: "http", status: 403 }, { kind: "http", status: 401 }, { kind: "unreachable" }]) {
      probe.mockResolvedValueOnce({ ok: false, problem });
      expect(await operatorReadAccess(cookie())).toBe(false);
    }
    probe.mockResolvedValueOnce({ ok: true, value: [] });
    expect(await operatorReadAccess(cookie())).toBe(true);
  });
});
