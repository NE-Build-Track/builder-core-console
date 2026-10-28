import "server-only";

import type { SignerSettings, SourceSettings } from "@/config/config";
import { failed, ok } from "@/domain/reading";
import { SIGNER_METRICS, type SignerMetrics } from "@/domain/signer";
import type { SignerReader } from "@/ports/sources";

import { brief, getText } from "../http";

type Options = { readonly timeoutMs: number; readonly now: () => Date };

/**
 * The node remote signer (docs/references/data-sources.md#signer). /readyz and /metrics come from the
 * metrics listener through the signer-metrics relay (gap G5). The signer only signs: discovery is the
 * discovery service (adapters/discovery). The console never calls a signing route.
 */
export function signerReader(settings: SourceSettings<SignerSettings>, options: Options): SignerReader {
  const at = () => options.now().toISOString();
  const notConfigured = () =>
    failed<never>("signer", { kind: "not_configured", detail: settings.ok ? "" : settings.missing }, at());

  return {
    async readiness() {
      if (!settings.ok) return notConfigured();
      const result = await getText(`${settings.value.metricsUrl}/readyz`, { timeoutMs: options.timeoutMs });
      if (!result.ok) return failed("signer", result.problem, at());
      const { status, body } = result.fetched;
      // 503 is a real answer: the signer is up but cannot pay (no funds, stale rate, unhealthy outbox).
      if (status === 200 || status === 503) {
        return ok("signer", { ready: status === 200, detail: body.trim() }, at());
      }
      return failed("signer", { kind: "http", status, detail: brief(body) }, at());
    },

    async metrics() {
      if (!settings.ok) return notConfigured();
      const result = await getText(`${settings.value.metricsUrl}/metrics`, { timeoutMs: options.timeoutMs });
      if (!result.ok) return failed("signer", result.problem, at());
      const { status, body } = result.fetched;
      if (status !== 200) return failed("signer", { kind: "http", status, detail: brief(body) }, at());
      return ok("signer", parseSignerMetrics(body), at());
    },
  };
}

/** Read the known signer series out of Prometheus text format. Unknown series and labels are ignored. */
export function parseSignerMetrics(text: string): SignerMetrics {
  const known = new Set<string>(SIGNER_METRICS);
  const metrics: Record<string, number> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{[^}]*\})?\s+(\S+)/.exec(trimmed);
    if (!match) continue;
    const [, name = "", raw = ""] = match;
    const value = Number(raw);
    if (known.has(name) && Number.isFinite(value)) metrics[name] = value;
  }
  return metrics as SignerMetrics;
}
