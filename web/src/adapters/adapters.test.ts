import { afterEach, describe, expect, it, vi } from "vitest";

import { NOW } from "../../tests/support/fixtures";

import { batteriesReader } from "./batteries/reader";
import { keyedEngine } from "./engine/keyed";
import { discoveryReader } from "./discovery/reader";
import { engineReader, httpProblem } from "./engine/reader";
import { engineWriter } from "./engine/writer";
import { parseSignerMetrics, signerReader } from "./signer/reader";

const now = () => NOW;
const respond = (status: number, body: unknown) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("signer adapter", () => {
  it("parses the signer's Prometheus text and ignores unknown series", () => {
    const text = [
      "# HELP livepeer_signer_up up",
      "livepeer_signer_up 1",
      "livepeer_signer_kafka_pending_events 3",
      'livepeer_signer_kafka_oldest_event_age_seconds{topic="x"} 12.5',
      "something_else 9",
    ].join("\n");
    expect(parseSignerMetrics(text)).toEqual({
      livepeer_signer_up: 1,
      livepeer_signer_kafka_pending_events: 3,
      livepeer_signer_kafka_oldest_event_age_seconds: 12.5,
    });
  });

  it("treats a 503 from /readyz as an answer, not a failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("signer payment dependencies unavailable\n", { status: 503 })));
    const reader = signerReader({ ok: true, value: { url: "http://s:8937", metricsUrl: "http://s:8939" } }, { timeoutMs: 1000, now });
    expect(await reader.readiness()).toMatchObject({ ok: true, value: { ready: false, detail: "signer payment dependencies unavailable" } });
  });

  it("says which setting is missing", async () => {
    const reader = signerReader({ ok: false, missing: "CONSOLE_SIGNER_URL" }, { timeoutMs: 1000, now });
    expect(await reader.readiness()).toMatchObject({ ok: false, problem: { kind: "not_configured", detail: "CONSOLE_SIGNER_URL" } });
  });
});

describe("discovery adapter", () => {
  const settings = { ok: true as const, value: { url: "http://discovery:8939" } };
  const inventory = [{ address: "https://hky.example:8936", runners: [{ url: "https://hky.example:8936/apps/r1/app", app: "a/b" }] }];

  it("reads the discovery service's /discovery inventory", async () => {
    const fetch = vi.fn(async () => respond(200, inventory));
    vi.stubGlobal("fetch", fetch);
    const reading = await discoveryReader(settings, { timeoutMs: 1000, now }).inventory();
    expect(String((fetch.mock.calls[0] as unknown[])[0])).toBe("http://discovery:8939/discovery");
    expect(reading).toMatchObject({ ok: true, source: "discovery", value: [{ address: "https://hky.example:8936", last_seen: null }] });
  });

  it("reports an HTTP error, a body it does not recognise, and a missing setting", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(503, "not ready")));
    expect(await discoveryReader(settings, { timeoutMs: 1000, now }).inventory()).toMatchObject({ ok: false, problem: { kind: "http", status: 503 } });
    vi.stubGlobal("fetch", vi.fn(async () => respond(200, { not: "a list" })));
    expect(await discoveryReader(settings, { timeoutMs: 1000, now }).inventory()).toMatchObject({ ok: false, problem: { kind: "unexpected" } });
    const missing = discoveryReader({ ok: false, missing: "CONSOLE_DISCOVERY_URL" }, { timeoutMs: 1000, now });
    expect(await missing.inventory()).toMatchObject({ ok: false, problem: { kind: "not_configured", detail: "CONSOLE_DISCOVERY_URL" } });
  });
});

describe("batteries adapter", () => {
  const settings = { ok: true as const, value: { url: "http://b:8081", token: "secret" } };

  it("walks cursor pages with the reader token", async () => {
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      expect((init.headers as Record<string, string>)["Livepeer-Clearinghouse-Token"]).toBe("secret");
      expect(init.method).toBe("GET");
      const cursor = new URL(url).searchParams.get("cursor");
      return cursor
        ? respond(200, { items: [{ id: "g2", name: "Two", status: "active", currency: "usd", total_usd: "1", created_at_ms: 2 }], next_cursor: "" })
        : respond(200, { items: [{ id: "g1", name: "One", status: "active", currency: "usd", total_usd: "2", created_at_ms: 1 }], next_cursor: "abc" });
    });
    vi.stubGlobal("fetch", fetch);
    const reading = await batteriesReader(settings, { timeoutMs: 1000, maxRows: 10_000, now }).grants();
    expect(reading.ok && reading.value.items.map((grant) => grant.id)).toEqual(["g1", "g2"]);
    expect(reading.ok && reading.value.truncated).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("stops at the row cap and says the list is truncated", async () => {
    const page = Array.from({ length: 1000 }, (_, index) => ({ id: `g${index}`, name: "g", status: "active", currency: "usd", created_at_ms: index }));
    vi.stubGlobal("fetch", vi.fn(async () => respond(200, { items: page, next_cursor: "more" })));
    const reading = await batteriesReader(settings, { timeoutMs: 1000, maxRows: 1000, now }).grants();
    expect(reading).toMatchObject({ ok: true, value: { truncated: true } });
  });

  it("rejects a body that does not match the pinned shape, naming the field", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(200, { items: [{ id: "g1" }], next_cursor: "" })));
    const reading = await batteriesReader(settings, { timeoutMs: 1000, maxRows: 1000, now }).grants();
    expect(reading).toMatchObject({ ok: false, problem: { kind: "unexpected" } });
    expect(!reading.ok && reading.problem.kind === "unexpected" && reading.problem.detail).toContain("items.0.name");
  });

  it("reports HTTP errors with the first line of the body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(403, "Forbidden\nmore")));
    const reading = await batteriesReader(settings, { timeoutMs: 1000, maxRows: 1000, now }).ledger();
    expect(reading).toMatchObject({ ok: false, problem: { kind: "http", status: 403, detail: "Forbidden" } });
  });

  it("reports a refused connection as unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("fetch failed", { cause: new Error("connect ECONNREFUSED 127.0.0.1:8081") });
    }));
    const reading = await batteriesReader(settings, { timeoutMs: 1000, maxRows: 1000, now }).ready();
    expect(reading).toMatchObject({ ok: false, problem: { kind: "unreachable", detail: "connect ECONNREFUSED 127.0.0.1:8081" } });
  });
});

describe("engine adapter", () => {
  const settings = { ok: true as const, value: { url: "http://e:8080", adminToken: "lpk_admin" } };
  const health = { ready: false, discovery_fresh: false, discovery_observed_at: null, discovery_error: "x", cost_sync_at: null, cost_sync_error: null, running_jobs: 0, allocation_mode: "per_actor", version: "v" };

  it("reads an unready engine's health from its 503 body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(503, health)));
    expect(await engineReader(settings, { timeoutMs: 1000, now }).health()).toMatchObject({ ok: true, value: { ready: false } });
  });

  it("sends the admin key and only GETs", async () => {
    const fetch = vi.fn(async (request: Request) => {
      expect(request.method).toBe("GET");
      expect(request.headers.get("authorization")).toBe("Bearer lpk_admin");
      expect(request.url).toBe("http://e:8080/v1/admin/reconciliation?application_id=default&actor_id=a");
      return respond(200, { application_id: "default" });
    });
    vi.stubGlobal("fetch", fetch);
    await engineReader(settings, { timeoutMs: 1000, now }).reconciliation({ applicationId: "default", actorId: "a" });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("never asks for the engine's grants with the read-only auditor token (builder-core #69)", async () => {
    const fetch = vi.fn(async () => respond(200, []));
    vi.stubGlobal("fetch", fetch);
    const auditor = { token: async () => ({ ok: true as const, source: "identity" as const, value: "jwt-reader", readAt: NOW.toISOString() }) };
    const reader = engineReader({ ok: true, value: { url: "http://e:8080", adminToken: null } }, { timeoutMs: 1000, now }, auditor);
    // grants fund every application and carry none, so the engine refuses them to an auditor
    expect(await reader.grants()).toMatchObject({ ok: false, problem: { kind: "not_permitted" } });
    expect(fetch).not.toHaveBeenCalled();
    await engineReader(settings, { timeoutMs: 1000, now }).grants(); // with an admin key they are read
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("inspects one key with the signed-in key, and reads its refusal as a problem (ISS-08)", async () => {
    const key = { key_id: "key_a b", actor_id: "acme", application_id: "default", kind: "actor", label: "", permissions: [], created_at: "2026-10-26T10:00:00Z", revoked_at: null };
    const fetch = vi.fn(async (request: Request) => {
      expect(request.method).toBe("GET");
      expect(request.headers.get("authorization")).toBe("Bearer lpk_operator");
      expect(request.url).toBe("http://e:8080/v1/admin/keys/key_a%20b");
      return respond(200, key);
    });
    vi.stubGlobal("fetch", fetch);
    const engine = keyedEngine("http://e:8080", "lpk_operator", { timeoutMs: 1000, now });
    expect(await engine.adminKey("key_a b")).toMatchObject({ ok: true, value: { key_id: "key_a b", actor_id: "acme" } });
    vi.stubGlobal("fetch", vi.fn(async () => respond(403, { error: "admin.keys requires an admin credential" })));
    const actorKey = keyedEngine("http://e:8080", "lpk_actor", { timeoutMs: 1000, now }); // the client keeps its fetch
    expect(await actorKey.adminKey("k1")).toMatchObject({ ok: false, problem: { kind: "http", status: 403 } });
  });

  it("turns engine error bodies into a status line", () => {
    expect(httpProblem(404, { error: "no allocation pays for actor 'x'" })).toEqual({ kind: "http", status: 404, detail: "no allocation pays for actor 'x'" });
    expect(httpProblem(422, { detail: [{ msg: "bad" }] })).toMatchObject({ status: 422, detail: '[{"msg":"bad"}]' });
  });

  it("keeps the engine's problem code, so a 409 is told apart by code and not by its text (D57)", () => {
    const body = { error: "operation_ref 'r1' was used for another request", code: "operation_conflict", operation: { command: "fund", operation_ref: "r1", state: "done" } };
    expect(httpProblem(409, body)).toEqual({ kind: "http", status: 409, detail: body.error, code: "operation_conflict" });
  });
});

describe("engine writer", () => {
  const call = { method: "POST" as const, template: "/v1/admin/grant/fund", path: "/v1/admin/grant/fund", body: { grant_id: "g1", amount: { amount: "1", currency: "USD" }, operation_ref: "console-fundGrant-1234abcd" } };
  const writer = () => engineWriter("http://e:8080", "lpk_operator", { timeoutMs: 1000, now });

  it("reads a command still running under its reference as a problem with the engine's Retry-After (D57)", async () => {
    const body = { error: "operation 'console-fundGrant-1234abcd' is still running", code: "operation_in_progress", operation: { command: "fund_grant", operation_ref: "console-fundGrant-1234abcd", state: "started" } };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 409, headers: { "content-type": "application/json", "retry-after": "1" } })));
    expect(await writer().send(call)).toMatchObject({ ok: false, problem: { kind: "http", status: 409, code: "operation_in_progress", retryAfterS: 1 } });
  });
});

describe("engine writer: replays", () => {
  const call = { method: "POST" as const, template: "/v1/admin/keys", path: "/v1/admin/keys", body: { actor_id: "acme", operation_ref: "console-issueKey-1234abcd" } };

  it("says when the engine answered from its record of the reference, and when it did not (D57)", async () => {
    const issued = { key: { key_id: "k2", actor_id: "acme", application_id: "default", kind: "actor" }, token: null, replayed: true };
    const answer = (replayed: boolean) => new Response(JSON.stringify(issued), { status: 201, headers: { "content-type": "application/json", ...(replayed ? { "idempotent-replayed": "true" } : {}) } });
    vi.stubGlobal("fetch", vi.fn(async () => answer(true)));
    expect(await engineWriter("http://e:8080", "lpk_operator", { timeoutMs: 1000, now }).send(call)).toMatchObject({ ok: true, replayed: true, exchange: { status: 201 } });
    vi.stubGlobal("fetch", vi.fn(async () => answer(false)));
    expect(await engineWriter("http://e:8080", "lpk_operator", { timeoutMs: 1000, now }).send(call)).toMatchObject({ ok: true, replayed: false });
  });
});

describe("keyed engine run", () => {
  it("reads a job still running under its reference with its code and Retry-After (D57)", async () => {
    const body = { error: "a job is still running under this operation_ref", code: "operation_in_progress", job: { id: "j1" } };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 409, headers: { "content-type": "application/json", "retry-after": "1", "livepeer-job-id": "j1" } })));
    const input = { app: "a/b", path: "/v1/chat/completions", method: "POST" as const, payload: {}, stream: false, timeoutS: 60, maxAttempts: 1, operationRef: "console-run-1234abcd" };
    const started = await keyedEngine("http://e:8080", "lpk_actor", { timeoutMs: 1000, now }).run(input, new AbortController().signal);
    expect(started).toMatchObject({ ok: false, status: 409, problem: { code: "operation_in_progress", retryAfterS: 1 } });
  });
});
