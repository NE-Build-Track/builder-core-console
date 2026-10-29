import "server-only";

import type { Exchange } from "@/domain/exchange";
import type { PlannedCall } from "@/domain/operator";
import type { EngineWriter, Written } from "@/ports/keyed";

import { parseJson, transportError } from "../http";
import { httpProblem } from "./reader";

type Options = { readonly timeoutMs: number; readonly now: () => Date };

/**
 * The Operator actions' only way out (decisions D15, D17): send one planned call, exactly as the review
 * step showed it, with the signed-in admin key, and keep the exchange for the page (D18).
 */
export function engineWriter(baseUrl: string, token: string, options: Options): EngineWriter {
  return {
    async send(call: PlannedCall): Promise<Written> {
      const started = Date.now();
      const exchange = (status: number | null, response?: unknown, problem?: string): Exchange => ({
        method: call.method,
        path: call.path,
        ...(call.body === undefined ? {} : { body: call.body }),
        status,
        ...(response === undefined ? {} : { response }),
        ...(problem ? { problem } : {}),
        at: options.now().toISOString(),
        ms: Date.now() - started,
      });
      try {
        const response = await fetch(`${baseUrl}${call.path}`, {
          method: call.method,
          headers: { Authorization: `Bearer ${token}`, ...(call.body === undefined ? {} : { "content-type": "application/json" }) },
          ...(call.body === undefined ? {} : { body: JSON.stringify(call.body) }),
          cache: "no-store",
          signal: AbortSignal.timeout(options.timeoutMs),
        });
        const text = await response.text();
        const body = text ? parseJson(text) : { ok: true as const, value: null };
        const value: unknown = body.ok ? body.value : text;
        if (response.ok) {
          const replayed = response.headers.get("idempotent-replayed")?.trim().toLowerCase() === "true";
          return { ok: true, value, replayed, exchange: exchange(response.status, value) };
        }
        return { ok: false, problem: httpProblem(response.status, value, response.headers), exchange: exchange(response.status, value) };
      } catch (error) {
        const detail = transportError(error);
        return { ok: false, problem: { kind: "unreachable", detail }, exchange: exchange(null, undefined, detail) };
      }
    },
  };
}
