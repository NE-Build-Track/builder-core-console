import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  protect: true,
  access: vi.fn(),
  open: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/runtime/session", () => ({
  COOKIE_NAMES: { operator: "bc_operator", builder: "bc_builder" },
  ENDED_COOKIE_NAMES: { operator: "bc_operator_ended", builder: "bc_builder_ended" },
  ENDED_MAX_AGE_S: 300, SESSION_MAX_AGE_S: 28800,
  consoleOrigin: () => "https://console.example.com",
  protectReads: () => session.protect,
  operatorReadAccess: session.access,
  endedKeySession: async () => null,
  openSession: session.open,
  refreshSession: session.refresh,
}));

import { proxy } from "./proxy";

beforeEach(() => {
  session.protect = true;
  session.open.mockReturnValue(null);
  session.access.mockResolvedValue(false);
  session.refresh.mockResolvedValue("fresh");
});
afterEach(() => vi.resetAllMocks());

describe("production request gate", () => {
  it("redirects anonymous HTML and RSC reads to the configured public origin", async () => {
    for (const headers of [new Headers(), new Headers({ rsc: "1" })]) {
      const response = await proxy(new NextRequest("http://internal:3000/money", { headers }));
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe("https://console.example.com/operator");
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
  });

  it("leaves builder and operator login pages available without stack access", async () => {
    for (const path of ["/builder", "/builder/api/jobs/1", "/operator"]) {
      expect((await proxy(new NextRequest(`http://internal:3000${path}`))).status).toBe(200);
    }
  });

  it("passes a refreshed cookie to the render and marks the response cookie Secure behind TLS termination", async () => {
    session.open.mockImplementation((area: string, cookie: string) => area === "operator" && cookie ? { area } : null);
    session.refresh.mockResolvedValue({ sealed: "refreshed" });
    session.access.mockImplementation(async (cookie: string) => cookie === "refreshed");
    const request = new NextRequest("http://internal:3000/users", { headers: { cookie: "bc_operator=old" } });
    const response = await proxy(request);
    expect(response.status).toBe(200);
    expect(request.cookies.get("bc_operator")?.value).toBe("refreshed");
    expect(response.cookies.get("bc_operator")?.value).toBe("refreshed");
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  it("removes a refused operator cookie from both render and response", async () => {
    const request = new NextRequest("http://internal:3000/operator", { headers: { cookie: "bc_operator=refused" } });
    const response = await proxy(request);
    expect(request.cookies.has("bc_operator")).toBe(false);
    expect(response.cookies.get("bc_operator")?.value).toBe("");
  });

  it("keeps local reads available when protection is off", async () => {
    session.protect = false;
    expect((await proxy(new NextRequest("http://localhost:3000/money"))).status).toBe(200);
    expect(session.access).not.toHaveBeenCalled();
  });
});
