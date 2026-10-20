import { describe, expect, it, vi } from "vitest";

import { cached, ttlCache } from "./ttl-cache";

describe("ttl cache", () => {
  it("reuses a read until it expires, then reads again", async () => {
    let clock = 0;
    const cache = ttlCache(1000, () => clock);
    const load = vi.fn(async () => clock);
    expect(await cache.get("k", load)).toBe(0);
    clock = 999;
    expect(await cache.get("k", load)).toBe(0);
    clock = 1000;
    expect(await cache.get("k", load)).toBe(1000);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight read between concurrent callers", async () => {
    const cache = ttlCache(1000);
    const load = vi.fn(() => new Promise<number>((resolve) => setTimeout(() => resolve(1), 5)));
    await Promise.all([cache.get("k", load), cache.get("k", load), cache.get("k", load)]);
    expect(load).toHaveBeenCalledOnce();
  });

  it("does not keep a rejected read", async () => {
    const cache = ttlCache(1000);
    await expect(cache.get("k", () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await Promise.resolve();
    expect(await cache.get("k", async () => "fresh")).toBe("fresh");
  });

  it("keys a wrapped reader by method and arguments", async () => {
    const reader = { runners: vi.fn(async (app: string) => app.length) };
    const wrapped = cached("engine", reader, ttlCache(1000));
    await wrapped.runners("a");
    await wrapped.runners("a");
    await wrapped.runners("bb");
    expect(reader.runners).toHaveBeenCalledTimes(2);
  });
});
