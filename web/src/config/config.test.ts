import { describe, expect, it } from "vitest";

import { readConfig } from "./config";

describe("config", () => {
  it("reads a complete environment", () => {
    const config = readConfig({
      CONSOLE_ENGINE_URL: "http://engine:8080/",
      CONSOLE_ENGINE_ADMIN_TOKEN: "lpk_x",
      CONSOLE_BATTERIES_URL: "http://clearinghouse:8081",
      CONSOLE_BATTERIES_TOKEN: "t",
      CONSOLE_SIGNER_URL: "http://clearinghouse:8937",
      CONSOLE_SIGNER_METRICS_URL: "http://clearinghouse:8939",
      CONSOLE_DISCOVERY_URL: "http://discovery:8939/",
      CONSOLE_CACHE_TTL_S: "5",
    });
    expect(config.engine).toEqual({ ok: true, value: { url: "http://engine:8080", adminToken: "lpk_x" } });
    expect(config.auth).toEqual({ mode: "keys" });
    expect(config.discovery).toEqual({ ok: true, value: { url: "http://discovery:8939" } });
    expect(config.cacheTtlMs).toBe(5000);
    expect(config.applicationId).toBe("default");
  });

  it("names what is missing instead of failing to start", () => {
    const config = readConfig({ CONSOLE_ENGINE_URL: "not a url" });
    expect(config.engine).toEqual({ ok: false, missing: "CONSOLE_ENGINE_URL, CONSOLE_ENGINE_ADMIN_TOKEN" });
    expect(config.batteries).toEqual({ ok: false, missing: "CONSOLE_BATTERIES_URL, CONSOLE_BATTERIES_TOKEN" });
    expect(config.discovery).toEqual({ ok: false, missing: "CONSOLE_DISCOVERY_URL" });
  });

  it("clamps numeric settings", () => {
    expect(readConfig({ CONSOLE_CACHE_TTL_S: "9999" }).cacheTtlMs).toBe(300_000);
    expect(readConfig({ CONSOLE_CACHE_TTL_S: "abc" }).cacheTtlMs).toBe(15_000);
  });

  describe("sign-in through the identity provider (CONSOLE_AUTH=oidc)", () => {
    const oidc = {
      CONSOLE_AUTH: "oidc",
      CONSOLE_ENGINE_URL: "http://engine:8080",
      CONSOLE_OIDC_ISSUER: "http://keycloak.localhost:8180/realms/livepeer/",
      CONSOLE_OIDC_CLIENT_ID: "builder-console",
      CONSOLE_OIDC_CLIENT_SECRET: "s1",
      CONSOLE_OIDC_REDIRECT_URL: "http://127.0.0.1:3061/auth/callback",
      CONSOLE_OIDC_ALLOW_HTTP: "true",
      CONSOLE_READER_CLIENT_ID: "console-reader",
      CONSOLE_READER_CLIENT_SECRET: "s2",
    };

    it("needs no engine admin key: background reads use the reader's client-credentials token", () => {
      const config = readConfig(oidc);
      expect(config.engine).toEqual({ ok: true, value: { url: "http://engine:8080", adminToken: null } });
      expect(config.auth).toEqual({
        mode: "oidc",
        oidc: {
          ok: true,
          value: {
            issuer: "http://keycloak.localhost:8180/realms/livepeer/",
            clientId: "builder-console",
            clientSecret: "s1",
            redirectUrl: "http://127.0.0.1:3061/auth/callback",
            operatorScope: "livepeer:admin",
            builderScopes: ["discover", "jobs.run", "jobs.read", "costs.read", "events.read"],
            allowHttp: true,
          },
        },
        reader: { ok: true, value: { clientId: "console-reader", clientSecret: "s2", scope: "livepeer:read" } },
      });
    });

    it("keeps the issuer exactly as given: it must match the token's iss", () => {
      const config = readConfig(oidc);
      expect(config.auth.mode === "oidc" && config.auth.oidc.ok && config.auth.oidc.value.issuer).toBe("http://keycloak.localhost:8180/realms/livepeer/");
    });

    it("names what is missing, and allows http only when told to", () => {
      const config = readConfig({ CONSOLE_AUTH: "oidc", CONSOLE_OIDC_ISSUER: "https://idp.example/realms/x" });
      expect(config.auth).toMatchObject({
        mode: "oidc",
        oidc: { ok: false, missing: "CONSOLE_OIDC_CLIENT_ID, CONSOLE_OIDC_CLIENT_SECRET, CONSOLE_OIDC_REDIRECT_URL" },
        reader: { ok: false, missing: "CONSOLE_READER_CLIENT_ID, CONSOLE_READER_CLIENT_SECRET" },
      });
      const https = readConfig({ ...oidc, CONSOLE_OIDC_ALLOW_HTTP: undefined });
      expect(https.auth).toMatchObject({ mode: "oidc", oidc: { ok: false, missing: expect.stringContaining("https") } });
    });
  });
});
