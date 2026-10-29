import "server-only";

import createClient from "openapi-fetch";

import { jobRequestOf, type RunInput } from "@/domain/builder";
import type { paths } from "@/domain/engine-schema";
import { fillPath, type Exchange } from "@/domain/exchange";
import { failed, ok, type Reading } from "@/domain/reading";
import type { KeyedEngine, RunStarted } from "@/ports/keyed";

import { parseJson, transportError } from "../http";
import { httpProblem } from "./reader";

type Options = { readonly timeoutMs: number; readonly now: () => Date };
type Outcome<T> = { readonly data?: T; readonly error?: unknown; readonly response: Response };

/**
 * The engine with one signed-in key (decision D16): what that key may read, and the job run for a
 * builder. Reads are uncached, because they are one person's view. The run is the only write here; it
 * streams the runner's response through unchanged (D20).
 */
export function keyedEngine(baseUrl: string, token: string, options: Options): KeyedEngine {
  const client = createClient<paths>({ baseUrl, headers: { Authorization: `Bearer ${token}` } });
  const at = () => options.now().toISOString();
  const signal = () => AbortSignal.timeout(options.timeoutMs);

  async function call<T>(work: () => Promise<Outcome<T>>): Promise<Reading<T>> {
    try {
      const { data, error, response } = await work();
      if (response.ok && data !== undefined) return ok("engine", data, at());
      return failed("engine", httpProblem(response.status, error), at());
    } catch (error) {
      return failed("engine", { kind: "unreachable", detail: transportError(error) }, at());
    }
  }

  async function run(input: RunInput, abort: AbortSignal): Promise<RunStarted> {
    const body = jobRequestOf(input);
    const path = fillPath("/v1/jobs", {}, { stream: String(input.stream) });
    const started = Date.now();
    const exchange = (status: number | null, response?: unknown, problem?: string): Exchange => ({
      method: "POST",
      path,
      body,
      status,
      ...(response === undefined ? {} : { response }),
      ...(problem ? { problem } : {}),
      at: at(),
      ms: Date.now() - started,
    });
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json",
          ...(input.stream ? { accept: "text/event-stream" } : {}),
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: abort,
      });
      const contentType = response.headers.get("content-type") ?? "application/octet-stream";
      const jobId = response.headers.get("livepeer-job-id");
      if (response.ok && response.body) {
        const note = `(${input.stream ? "streamed" : "returned"} ${contentType}; job ${jobId ?? "unknown"})`;
        return { ok: true, status: response.status, contentType, jobId, body: response.body, exchange: exchange(response.status, note) };
      }
      const text = await response.text();
      const parsedBody = parseJson(text);
      const value: unknown = parsedBody.ok ? parsedBody.value : text;
      return { ok: false, status: response.status, response: value, problem: httpProblem(response.status, value, response.headers), exchange: exchange(response.status, value) };
    } catch (error) {
      const detail = transportError(error);
      return { ok: false, status: null, response: undefined, problem: { kind: "unreachable", detail }, exchange: exchange(null, undefined, detail) };
    }
  }

  return {
    adminKeys: () => call(() => client.GET("/v1/admin/keys", { signal: signal() })),
    adminKey: (keyId) => call(() => client.GET("/v1/admin/keys/{key_id}", { params: { path: { key_id: keyId } }, signal: signal() })),
    myJobs: (limit) => call(() => client.GET("/v1/jobs", { params: { query: { limit } }, signal: signal() })),
    adminActors: (limit) => call(() => client.GET("/v1/admin/actors", { params: { query: { limit } }, signal: signal() })),
    offerings: () => call(() => client.GET("/v1/offerings", { signal: signal() })),
    runners: (app) => call(() => client.GET("/v1/runners", { params: { query: { app } }, signal: signal() })),
    job: (id) => call(() => client.GET("/v1/jobs/{job_id}", { params: { path: { job_id: id } }, signal: signal() })),
    jobCost: (id) => call(() => client.GET("/v1/jobs/{job_id}/cost", { params: { path: { job_id: id } }, signal: signal() })),
    allowance: (actorId) =>
      call(() => client.GET("/v1/allowance", { params: { query: actorId ? { actor_id: actorId } : {} }, signal: signal() })),
    grants: () => call(() => client.GET("/v1/admin/grants", { signal: signal() })),
    costSummary: (start, end) => call(() => client.GET("/v1/costs/summary", { params: { query: { start, end } }, signal: signal() })),
    run,
  };
}
