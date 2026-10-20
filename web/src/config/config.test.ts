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
      CONSOLE_CACHE_TTL_S: "5",
    });
    expect(config.engine).toEqual({ ok: true, value: { url: "http://engine:8080", adminToken: "lpk_x" } });
    expect(config.cacheTtlMs).toBe(5000);
    expect(config.applicationId).toBe("default");
  });

  it("names what is missing instead of failing to start", () => {
    const config = readConfig({ CONSOLE_ENGINE_URL: "not a url" });
    expect(config.engine).toEqual({ ok: false, missing: "CONSOLE_ENGINE_URL, CONSOLE_ENGINE_ADMIN_TOKEN" });
    expect(config.batteries).toEqual({ ok: false, missing: "CONSOLE_BATTERIES_URL, CONSOLE_BATTERIES_TOKEN" });
  });

  it("clamps numeric settings", () => {
    expect(readConfig({ CONSOLE_CACHE_TTL_S: "9999" }).cacheTtlMs).toBe(300_000);
    expect(readConfig({ CONSOLE_CACHE_TTL_S: "abc" }).cacheTtlMs).toBe(15_000);
  });
});
