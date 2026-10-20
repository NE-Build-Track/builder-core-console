import "server-only";

import type { Problem } from "@/domain/reading";

/**
 * The one HTTP verb the console uses. Every upstream read goes through `getText` (Batteries, signer) or
 * the engine's typed client, which tests/structure/read-only.test.ts restricts to GET.
 */

export type Fetched = { readonly status: number; readonly body: string };

export type GetResult = { readonly ok: true; readonly fetched: Fetched } | { readonly ok: false; readonly problem: Problem };

export async function getText(
  url: string,
  options: { readonly headers?: Readonly<Record<string, string>>; readonly timeoutMs: number },
): Promise<GetResult> {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: options.headers,
      cache: "no-store",
      signal: AbortSignal.timeout(options.timeoutMs),
    });
    return { ok: true, fetched: { status: response.status, body: await response.text() } };
  } catch (error) {
    return { ok: false, problem: { kind: "unreachable", detail: transportError(error) } };
  }
}

export function transportError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError") return "timed out";
    const cause = (error as Error & { cause?: unknown }).cause;
    if (cause instanceof Error && cause.message) return cause.message;
    return error.message;
  }
  return "request failed";
}

/** The first line of an error body, for a status line. Bodies can be large HTML pages. */
export function brief(body: string): string {
  const line = body.trim().split("\n")[0] ?? "";
  return line.length > 200 ? `${line.slice(0, 200)}…` : line || "(empty body)";
}

export function parseJson(body: string): { readonly ok: true; readonly value: unknown } | { readonly ok: false } {
  try {
    return { ok: true, value: JSON.parse(body) as unknown };
  } catch {
    return { ok: false };
  }
}
