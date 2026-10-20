import "server-only";

import createClient from "openapi-fetch";

import type { EngineSettings, SourceSettings } from "@/config/config";
import type { EngineHealth } from "@/domain/engine";
import type { paths } from "@/domain/engine-schema";
import { failed, ok, type Problem, type Reading } from "@/domain/reading";
import type { EngineReader } from "@/ports/sources";

import { transportError } from "../http";

type Options = { readonly timeoutMs: number; readonly now: () => Date };

type Outcome<T> = { readonly data?: T; readonly error?: unknown; readonly response: Response };

/**
 * The stock builder-core REST engine, read with its admin key (docs/references/data-sources.md#engine).
 * Responses are typed by the client generated from the pinned spec; the engine image and the spec come
 * from the same commit (domain/pins.ts), so the types are the engine's own contract.
 *
 * Only GET is ever called (decision D1). The admin key could do far more (gap G8).
 */
export function engineReader(settings: SourceSettings<EngineSettings>, options: Options): EngineReader {
  const at = () => options.now().toISOString();
  const client = settings.ok
    ? createClient<paths>({
        baseUrl: settings.value.url,
        headers: { Authorization: `Bearer ${settings.value.adminToken}` },
      })
    : null;
  const signal = () => AbortSignal.timeout(options.timeoutMs);

  async function guard<T>(work: (c: NonNullable<typeof client>) => Promise<Reading<T>>): Promise<Reading<T>> {
    if (!client || !settings.ok) {
      return failed("engine", { kind: "not_configured", detail: settings.ok ? "" : settings.missing }, at());
    }
    try {
      return await work(client);
    } catch (error) {
      return failed("engine", { kind: "unreachable", detail: transportError(error) }, at());
    }
  }

  function call<T>(work: (c: NonNullable<typeof client>) => Promise<Outcome<T>>): Promise<Reading<T>> {
    return guard(async (c) => {
      const { data, error, response } = await work(c);
      if (response.ok && data !== undefined) return ok("engine", data, at());
      return failed("engine", httpProblem(response.status, error), at());
    });
  }

  return {
    async health() {
      // /readyz answers 503 with the same EngineHealth body when the engine is not ready: that is a
      // successful reading of an unready engine, not a failed read.
      return guard(async (c) => {
        const { data, error, response } = await c.GET("/readyz", { signal: signal() });
        const body: unknown = data ?? error;
        if (typeof body === "object" && body !== null && "ready" in body) {
          return ok("engine", body as EngineHealth, at());
        }
        return failed("engine", httpProblem(response.status, error), at());
      });
    },
    offerings: () => call((c) => c.GET("/v1/offerings", { signal: signal() })),
    runners: (app) => call((c) => c.GET("/v1/runners", { params: { query: { app } }, signal: signal() })),
    grants: () => call((c) => c.GET("/v1/admin/grants", { signal: signal() })),
    keys: () => call((c) => c.GET("/v1/admin/keys", { signal: signal() })),
    allowance: (actorId) =>
      call((c) => c.GET("/v1/allowance", { params: { query: { actor_id: actorId } }, signal: signal() })),
    costSummary: ({ start, end, actorId }) =>
      call((c) =>
        c.GET("/v1/costs/summary", {
          params: { query: { start, end, ...(actorId ? { actor_id: actorId } : {}) } },
          signal: signal(),
        }),
      ),
    costProjections: () =>
      call((c) => c.GET("/v1/costs/projections", { params: { query: { limit: 25 } }, signal: signal() })),
    reconciliation: ({ applicationId, actorId }) =>
      call((c) =>
        c.GET("/v1/admin/reconciliation", {
          params: { query: { application_id: applicationId, ...(actorId ? { actor_id: actorId } : {}) } },
          signal: signal(),
        }),
      ),
    job: (id) => call((c) => c.GET("/v1/jobs/{job_id}", { params: { path: { job_id: id } }, signal: signal() })),
    jobCost: (id) =>
      call((c) => c.GET("/v1/jobs/{job_id}/cost", { params: { path: { job_id: id } }, signal: signal() })),
  };
}

/** Engine errors are `{"error": "..."}`; FastAPI's validation errors are `{"detail": [...]}`. */
export function httpProblem(status: number, error: unknown): Problem {
  let detail = "request failed";
  if (typeof error === "object" && error !== null) {
    const body = error as { error?: unknown; detail?: unknown };
    const value = body.error ?? body.detail;
    if (value !== undefined) detail = typeof value === "string" ? value : JSON.stringify(value).slice(0, 200);
  } else if (typeof error === "string" && error) {
    detail = error.slice(0, 200);
  }
  return { kind: "http", status, detail };
}
