import "server-only";

import createClient from "openapi-fetch";

import type { EngineSettings, SourceSettings } from "@/config/config";
import type { EngineHealth } from "@/domain/engine";
import type { paths } from "@/domain/engine-schema";
import { describeProblem, failed, ok, type Problem, type Reading } from "@/domain/reading";
import type { TokenSource } from "@/ports/identity";
import type { EngineReader } from "@/ports/sources";

import { transportError } from "../http";

type Options = { readonly timeoutMs: number; readonly now: () => Date };

type Outcome<T> = { readonly data?: T; readonly error?: unknown; readonly response: Response };

/**
 * The stock builder-core REST engine, read with its admin key (docs/references/data-sources.md#engine).
 * Responses are typed by the client generated from the pinned spec; the engine image and the spec come
 * from the same commit (domain/pins.ts), so the types are the engine's own contract.
 *
 * Only GET is ever called (decision D1). The admin key could do far more (gap G8). With CONSOLE_AUTH=oidc
 * there is no admin key: `tokens` is the console's read-only client-credentials token (an auditor), so
 * the engine itself refuses any write on this path.
 */
export function engineReader(settings: SourceSettings<EngineSettings>, options: Options, tokens: TokenSource | null = null): EngineReader {
  const at = () => options.now().toISOString();
  const client = settings.ok ? createClient<paths>({ baseUrl: settings.value.url }) : null;
  const signal = () => AbortSignal.timeout(options.timeoutMs);
  client?.use({
    async onRequest({ request }) {
      const token = await bearer();
      if (!token.ok) throw new NoReadToken(describeProblem(token.problem));
      request.headers.set("Authorization", `Bearer ${token.value}`);
      return request;
    },
  });

  async function bearer(): Promise<Reading<string>> {
    if (settings.ok && settings.value.adminToken) return ok("engine", settings.value.adminToken, at());
    if (!tokens) return failed("engine", { kind: "not_configured", detail: "CONSOLE_READER_CLIENT_ID, CONSOLE_READER_CLIENT_SECRET" }, at());
    return tokens.token();
  }

  async function guard<T>(work: (c: NonNullable<typeof client>) => Promise<Reading<T>>): Promise<Reading<T>> {
    if (!client || !settings.ok) {
      return failed("engine", { kind: "not_configured", detail: settings.ok ? "" : settings.missing }, at());
    }
    try {
      return await work(client);
    } catch (error) {
      const detail = error instanceof NoReadToken ? `the console's read token: ${error.message}` : transportError(error);
      return failed("engine", { kind: "unreachable", detail }, at());
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
    // Grants fund every application and carry none, so the engine refuses them to an auditor (builder-core #69):
    // with only the read-only token, say so instead of asking for a 403.
    grants: () =>
      settings.ok && !settings.value.adminToken && tokens
        ? Promise.resolve(failed("engine", { kind: "not_permitted", detail: "the read-only auditor never reads the operator's grants" }, at()))
        : call((c) => c.GET("/v1/admin/grants", { signal: signal() })),
    keys: () => call((c) => c.GET("/v1/admin/keys", { signal: signal() })),
    actors: () => call((c) => c.GET("/v1/admin/actors", { params: { query: { limit: 1000 } }, signal: signal() })),
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

/** The read token could not be had, so the request was never sent. */
class NoReadToken extends Error {}

/**
 * Engine errors are `{"error": "...", "code"?: "..."}`; FastAPI's validation errors are `{"detail": [...]}`.
 * The `code` is kept, so callers branch on it and never on the message, and so is `Retry-After` when it
 * is a number of seconds (builder-core D57).
 */
export function httpProblem(status: number, error: unknown, headers?: Headers): Problem {
  let detail = "request failed";
  let code: string | undefined;
  if (typeof error === "object" && error !== null) {
    const body = error as { error?: unknown; detail?: unknown; code?: unknown };
    const value = body.error ?? body.detail;
    if (value !== undefined) detail = typeof value === "string" ? value : JSON.stringify(value).slice(0, 200);
    if (typeof body.code === "string" && body.code) code = body.code;
  } else if (typeof error === "string" && error) {
    detail = error.slice(0, 200);
  }
  const retryAfter = headers?.get("retry-after")?.trim() ?? "";
  const retryAfterS = /^\d{1,6}$/.test(retryAfter) ? Number(retryAfter) : undefined;
  return { kind: "http", status, detail, ...(code ? { code } : {}), ...(retryAfterS === undefined ? {} : { retryAfterS }) };
}
