import "server-only";

import type { DiscoverySettings, SourceSettings } from "@/config/config";
import { discoverySchema } from "@/domain/discovery";
import { failed, ok } from "@/domain/reading";
import type { DiscoveryReader } from "@/ports/sources";

import { brief, getText, parseJson } from "../http";

type Options = { readonly timeoutMs: number; readonly now: () => Date };

/**
 * The discovery service, ``lpb discovery`` from the pinned builder-core (docs/references/data-sources.md#discovery):
 * GET /discovery is the inventory the engine reads too, so the Network page shows what the engine can buy.
 */
export function discoveryReader(settings: SourceSettings<DiscoverySettings>, options: Options): DiscoveryReader {
  const at = () => options.now().toISOString();

  return {
    async inventory() {
      if (!settings.ok) return failed("discovery", { kind: "not_configured", detail: settings.missing }, at());
      const result = await getText(`${settings.value.url}/discovery`, {
        headers: { accept: "application/json" },
        timeoutMs: options.timeoutMs,
      });
      if (!result.ok) return failed("discovery", result.problem, at());
      const { status, body } = result.fetched;
      if (status !== 200) return failed("discovery", { kind: "http", status, detail: brief(body) }, at());
      const json = parseJson(body);
      const parsed = json.ok ? discoverySchema.safeParse(json.value) : null;
      if (!parsed?.success) {
        return failed("discovery", { kind: "unexpected", detail: "the discovery answer is not an inventory list" }, at());
      }
      return ok("discovery", parsed.data, at());
    },
  };
}
