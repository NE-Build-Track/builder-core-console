import { describe, expect, it } from "vitest";

import { seal, unseal } from "./seal";

const SECRET = "a-session-secret-that-is-long-enough-1234";

describe("sealed sessions", () => {
  it("round-trips a value and hides it from whoever holds the cookie", () => {
    const sealed = seal(SECRET, { token: "lpk_secret", area: "builder" });
    expect(sealed).not.toContain("lpk_secret");
    expect(unseal(SECRET, sealed)).toEqual({ token: "lpk_secret", area: "builder" });
  });

  it("refuses a changed cookie, another secret, or garbage", () => {
    const sealed = seal(SECRET, { area: "operator" });
    const [version, iv, tag, body] = sealed.split(".") as [string, string, string, string];
    // The first base64 character always maps to whole bits of the first byte, so changing it changes the data.
    const flipped = `${version}.${iv}.${tag}.${body.startsWith("A") ? "B" : "A"}${body.slice(1)}`;
    expect(unseal(SECRET, flipped)).toBeNull();
    expect(unseal("another-secret-that-is-long-enough-5678", sealed)).toBeNull();
    expect(unseal(SECRET, "not.a.cookie")).toBeNull();
  });
});
