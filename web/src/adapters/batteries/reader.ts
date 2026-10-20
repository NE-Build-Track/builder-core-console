import "server-only";

import type { BatteriesSettings, SourceSettings } from "@/config/config";
import {
  allocationSchema,
  apiKeySchema,
  escrowReportSchema,
  grantSchema,
  ledgerReportSchema,
  pageSchema,
  paymentSessionSchema,
  usageEventSchema,
  type Listing,
  type Parsed,
  type Schema,
} from "@/domain/batteries";
import { failed, ok, type Reading } from "@/domain/reading";
import type { BatteriesReader } from "@/ports/sources";

import { brief, getText, parseJson } from "../http";

/** Batteries' largest page (internal/app/pagination.go: maxListLimit). */
const PAGE_SIZE = 1000;
const TOKEN_HEADER = "Livepeer-Clearinghouse-Token";

type Options = { readonly timeoutMs: number; readonly maxRows: number; readonly now: () => Date };

/**
 * Batteries management API, read-only (docs/references/data-sources.md#batteries). The token is the
 * console-reader credential, which Batteries itself limits to `*.read` permissions.
 */
export function batteriesReader(settings: SourceSettings<BatteriesSettings>, options: Options): BatteriesReader {
  const at = () => options.now().toISOString();

  async function read<T extends Schema>(path: string, schema: T): Promise<Reading<Parsed<T>>> {
    if (!settings.ok) return failed("batteries", { kind: "not_configured", detail: settings.missing }, at());
    const result = await getText(`${settings.value.url}${path}`, {
      headers: { [TOKEN_HEADER]: settings.value.token, accept: "application/json" },
      timeoutMs: options.timeoutMs,
    });
    if (!result.ok) return failed("batteries", result.problem, at());
    const { status, body } = result.fetched;
    if (status !== 200) return failed("batteries", { kind: "http", status, detail: brief(body) }, at());
    const json = parseJson(body);
    if (!json.ok) return failed("batteries", { kind: "unexpected", detail: `${path} did not return JSON` }, at());
    const parsed = schema.safeParse(json.value);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue ? `${issue.path.join(".")}: ${issue.message}` : "shape mismatch";
      return failed("batteries", { kind: "unexpected", detail: `${path} ${where}` }, at());
    }
    return ok("batteries", parsed.data, at());
  }

  /** Walk a cursor-paged list until its last page or the row cap (gap G6). */
  async function list<T extends Schema>(path: string, item: T, filter = ""): Promise<Reading<Listing<Parsed<T>>>> {
    const schema = pageSchema(item);
    const items: Parsed<T>[] = [];
    let cursor = "";
    for (;;) {
      const query = new URLSearchParams(filter);
      query.set("limit", String(PAGE_SIZE));
      if (cursor) query.set("cursor", cursor);
      const page = await read(`${path}?${query}`, schema);
      if (!page.ok) return page;
      items.push(...(page.value.items as Parsed<T>[]));
      cursor = page.value.next_cursor;
      if (!cursor) return ok("batteries", { items, truncated: false }, page.readAt);
      if (items.length >= options.maxRows) return ok("batteries", { items, truncated: true }, page.readAt);
    }
  }

  return {
    async ready() {
      if (!settings.ok) return failed("batteries", { kind: "not_configured", detail: settings.missing }, at());
      const result = await getText(`${settings.value.url}/readyz`, { timeoutMs: options.timeoutMs });
      if (!result.ok) return failed("batteries", result.problem, at());
      const { status, body } = result.fetched;
      return status === 200
        ? ok("batteries", true as const, at())
        : failed("batteries", { kind: "http", status, detail: brief(body) }, at());
    },
    grants: () => list("/v1/grants", grantSchema),
    allocations: () => list("/v1/allocations", allocationSchema),
    apiKeys: () => list("/v1/api-keys", apiKeySchema),
    sessions: () => list("/v1/sessions", paymentSessionSchema),
    usage: () => list("/v1/usage", usageEventSchema),
    usageForManifest: (manifestId) => list("/v1/usage", usageEventSchema, `manifest_id=${encodeURIComponent(manifestId)}`),
    ledger: () => read("/v1/ledger/report", ledgerReportSchema),
    escrow: () => read("/v1/escrow/report", escrowReportSchema),
  };
}
