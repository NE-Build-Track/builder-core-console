/**
 * One REST call as the console made it (decision D18): what was sent and what came back, so every action
 * can show its request and response and be copied as curl. Keys never appear: the Authorization header
 * is shown as a variable, and any `lpk_`/`lpg_` token inside a body is replaced before display.
 */

export type HttpMethod = "GET" | "POST";

export type Exchange = {
  readonly method: HttpMethod;
  /** The path with its parameters filled in and its query string, as sent. */
  readonly path: string;
  readonly body?: unknown;
  /** Null when no response arrived (the engine was unreachable, or the call has not been sent yet). */
  readonly status: number | null;
  readonly response?: unknown;
  /** Why there was no usable response, in a few words. */
  readonly problem?: string;
  /** Auth0's management API. Absent means the engine. */
  readonly host?: "auth0";
  readonly at: string;
  readonly ms: number;
};

const TOKEN = /\b(lp[kg]_)[A-Za-z0-9_-]{6,}/g;

/** The same value with every engine or gateway key replaced by its prefix and an ellipsis. */
export function hideSecrets<T>(value: T): T {
  if (typeof value === "string") return value.replace(TOKEN, "$1…(hidden)") as T;
  if (Array.isArray(value)) return value.map((item) => hideSecrets(item)) as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, hideSecrets(item)])) as T;
  }
  return value;
}

/** A path template filled in: `/v1/jobs/{job_id}` with `{ job_id: "…" }`. Values are URL-encoded. */
export function fillPath(template: string, params: Readonly<Record<string, string>> = {}, query: Readonly<Record<string, string>> = {}): string {
  const path = template.replace(/\{(\w+)\}/g, (_, name: string) => encodeURIComponent(params[name] ?? `{${name}}`));
  const search = new URLSearchParams(query).toString();
  return search ? `${path}?${search}` : path;
}

function shellQuote(text: string): string {
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

/**
 * The call as a curl command. An engine call uses `$LPB_KEY` and `$ENGINE_URL`. An Auth0 management
 * call uses `$AUTH0_MGMT_TOKEN` and `$AUTH0_DOMAIN`. Nothing secret is ever on the page to copy.
 */
export function curlOf(exchange: Pick<Exchange, "method" | "path" | "body" | "host">): string {
  const target = exchange.host === "auth0" ? `https://$AUTH0_DOMAIN${exchange.path}` : `$ENGINE_URL${exchange.path}`;
  const credential = exchange.host === "auth0" ? "$AUTH0_MGMT_TOKEN" : "$LPB_KEY";
  const lines = [`curl -sS -X ${exchange.method} "${target}"`, `  -H "Authorization: Bearer ${credential}"`];
  if (exchange.body !== undefined) {
    lines.push(`  -H 'content-type: application/json'`, `  -d ${shellQuote(JSON.stringify(hideSecrets(exchange.body)))}`);
  }
  return lines.join(" \\\n");
}

/** A response body as text for the panel: pretty JSON when it is JSON, otherwise as it came. */
export function showBody(body: unknown): string {
  if (body === undefined) return "";
  if (typeof body === "string") return hideSecrets(body);
  return JSON.stringify(hideSecrets(body), null, 2);
}
