import "server-only";

/**
 * Console settings from CONSOLE_* environment variables (deploy/.env.example, docs/RELIABILITY.md).
 * A missing setting is not an error at start: the source it belongs to reads as "not configured" on
 * every page, so a half-configured console still shows what it can.
 */

export type SourceSettings<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly missing: string };

export type EngineSettings = { readonly url: string; readonly adminToken: string };
export type BatteriesSettings = { readonly url: string; readonly token: string };
export type SignerSettings = { readonly url: string; readonly metricsUrl: string };

export type ConsoleConfig = {
  readonly engine: SourceSettings<EngineSettings>;
  readonly batteries: SourceSettings<BatteriesSettings>;
  readonly signer: SourceSettings<SignerSettings>;
  readonly applicationId: string;
  readonly cacheTtlMs: number;
  /** Per-request timeout for every upstream read. */
  readonly timeoutMs: number;
  /** The most rows the console reads from one Batteries list (gap G6). */
  readonly maxListRows: number;
  /**
   * Seals the Operator and Builder sessions (decision D16). Without it, sign-in is off and the console
   * stays read-only. At least 32 characters; deploy/first-run.sh writes one.
   */
  readonly sessionSecret: string | null;
};

type Env = Readonly<Record<string, string | undefined>>;

function text(env: Env, name: string): string | null {
  const value = env[name]?.trim();
  return value ? value : null;
}

function url(env: Env, name: string): string | null {
  const value = text(env, name);
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return value.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function secret(env: Env, name: string): string | null {
  const value = text(env, name);
  return value && value.length >= 32 ? value : null;
}

function number(env: Env, name: string, fallback: number, min: number, max: number): number {
  const raw = text(env, name);
  const value = raw === null ? Number.NaN : Number(raw);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function settings<T>(entries: Record<string, string | null>, build: (values: Record<string, string>) => T): SourceSettings<T> {
  const missing = Object.entries(entries)
    .filter(([, value]) => value === null)
    .map(([name]) => name);
  if (missing.length > 0) return { ok: false, missing: missing.join(", ") };
  return { ok: true, value: build(entries as Record<string, string>) };
}

export function readConfig(env: Env = process.env): ConsoleConfig {
  return {
    engine: settings(
      { CONSOLE_ENGINE_URL: url(env, "CONSOLE_ENGINE_URL"), CONSOLE_ENGINE_ADMIN_TOKEN: text(env, "CONSOLE_ENGINE_ADMIN_TOKEN") },
      (v) => ({ url: v.CONSOLE_ENGINE_URL as string, adminToken: v.CONSOLE_ENGINE_ADMIN_TOKEN as string }),
    ),
    batteries: settings(
      { CONSOLE_BATTERIES_URL: url(env, "CONSOLE_BATTERIES_URL"), CONSOLE_BATTERIES_TOKEN: text(env, "CONSOLE_BATTERIES_TOKEN") },
      (v) => ({ url: v.CONSOLE_BATTERIES_URL as string, token: v.CONSOLE_BATTERIES_TOKEN as string }),
    ),
    signer: settings(
      { CONSOLE_SIGNER_URL: url(env, "CONSOLE_SIGNER_URL"), CONSOLE_SIGNER_METRICS_URL: url(env, "CONSOLE_SIGNER_METRICS_URL") },
      (v) => ({ url: v.CONSOLE_SIGNER_URL as string, metricsUrl: v.CONSOLE_SIGNER_METRICS_URL as string }),
    ),
    applicationId: text(env, "CONSOLE_APPLICATION_ID") ?? "default",
    cacheTtlMs: number(env, "CONSOLE_CACHE_TTL_S", 15, 0, 300) * 1000,
    timeoutMs: number(env, "CONSOLE_TIMEOUT_S", 8, 1, 60) * 1000,
    maxListRows: number(env, "CONSOLE_MAX_LIST_ROWS", 20_000, 1000, 200_000),
    sessionSecret: secret(env, "CONSOLE_SESSION_SECRET"),
  };
}
