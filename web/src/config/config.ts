import "server-only";

/**
 * Console settings from CONSOLE_* environment variables (deploy/.env.example, docs/RELIABILITY.md).
 * A missing setting is not an error at start: the source it belongs to reads as "not configured" on
 * every page, so a half-configured console still shows what it can.
 */

export type SourceSettings<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly missing: string };

/** `adminToken` is null when the console signs in through the identity provider: reads then use the reader's token. */
export type EngineSettings = { readonly url: string; readonly adminToken: string | null };

/** The console as an OpenID Connect client (CONSOLE_AUTH=oidc): authorization code with PKCE, server side. */
export type OidcSettings = {
  /** Exactly as the provider names itself: it must equal the tokens' `iss`. */
  readonly issuer: string;
  readonly clientId: string;
  readonly clientSecret: string;
  /** The console's /auth/callback as the browser reaches it; registered with the provider. */
  readonly redirectUrl: string;
  readonly operatorScope: string;
  readonly builderScopes: readonly string[];
  /** Local development only: an http issuer, such as a Keycloak in deploy/keycloak. */
  readonly allowHttp: boolean;
};

/** The console's own read-only identity: a client-credentials token for the background reads. */
export type ReaderSettings = { readonly clientId: string; readonly clientSecret: string; readonly scope: string };

export type AuthSettings =
  | { readonly mode: "keys" }
  | { readonly mode: "oidc"; readonly oidc: SourceSettings<OidcSettings>; readonly reader: SourceSettings<ReaderSettings> };
export type BatteriesSettings = { readonly url: string; readonly token: string };
export type SignerSettings = { readonly url: string; readonly metricsUrl: string };
export type DiscoverySettings = { readonly url: string };

export type ConsoleConfig = {
  /** How people sign in to the writing areas: pasted engine keys (default), or the identity provider. */
  readonly auth: AuthSettings;
  readonly engine: SourceSettings<EngineSettings>;
  readonly batteries: SourceSettings<BatteriesSettings>;
  readonly signer: SourceSettings<SignerSettings>;
  readonly discovery: SourceSettings<DiscoverySettings>;
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

const BUILDER_SCOPES = ["discover", "jobs.run", "jobs.read", "costs.read", "events.read"];

function words(env: Env, name: string, fallback: readonly string[]): readonly string[] {
  const value = text(env, name);
  return value ? value.split(/\s+/) : fallback;
}

/** The issuer kept exactly (a trailing slash is part of it); https unless CONSOLE_OIDC_ALLOW_HTTP=true. */
function issuer(env: Env, allowHttp: boolean): string | null {
  const value = text(env, "CONSOLE_OIDC_ISSUER");
  if (!value) return null;
  try {
    const protocol = new URL(value).protocol;
    return protocol === "https:" || (allowHttp && protocol === "http:") ? value : null;
  } catch {
    return null;
  }
}

function auth(env: Env): AuthSettings {
  if (text(env, "CONSOLE_AUTH") !== "oidc") return { mode: "keys" };
  const allowHttp = text(env, "CONSOLE_OIDC_ALLOW_HTTP") === "true";
  const issuerName = allowHttp ? "CONSOLE_OIDC_ISSUER" : "CONSOLE_OIDC_ISSUER (https, or CONSOLE_OIDC_ALLOW_HTTP=true)";
  return {
    mode: "oidc",
    oidc: settings(
      {
        [issuerName]: issuer(env, allowHttp),
        CONSOLE_OIDC_CLIENT_ID: text(env, "CONSOLE_OIDC_CLIENT_ID"),
        CONSOLE_OIDC_CLIENT_SECRET: text(env, "CONSOLE_OIDC_CLIENT_SECRET"),
        CONSOLE_OIDC_REDIRECT_URL: url(env, "CONSOLE_OIDC_REDIRECT_URL"),
      },
      (v) => ({
        issuer: v[issuerName] as string,
        clientId: v.CONSOLE_OIDC_CLIENT_ID as string,
        clientSecret: v.CONSOLE_OIDC_CLIENT_SECRET as string,
        redirectUrl: v.CONSOLE_OIDC_REDIRECT_URL as string,
        operatorScope: text(env, "CONSOLE_OIDC_OPERATOR_SCOPE") ?? "livepeer:admin",
        builderScopes: words(env, "CONSOLE_OIDC_BUILDER_SCOPES", BUILDER_SCOPES),
        allowHttp,
      }),
    ),
    reader: settings(
      { CONSOLE_READER_CLIENT_ID: text(env, "CONSOLE_READER_CLIENT_ID"), CONSOLE_READER_CLIENT_SECRET: text(env, "CONSOLE_READER_CLIENT_SECRET") },
      (v) => ({
        clientId: v.CONSOLE_READER_CLIENT_ID as string,
        clientSecret: v.CONSOLE_READER_CLIENT_SECRET as string,
        scope: text(env, "CONSOLE_READER_SCOPE") ?? "livepeer:read",
      }),
    ),
  };
}

export function readConfig(env: Env = process.env): ConsoleConfig {
  const signIn = auth(env);
  return {
    auth: signIn,
    engine:
      signIn.mode === "oidc"
        ? settings({ CONSOLE_ENGINE_URL: url(env, "CONSOLE_ENGINE_URL") }, (v) => ({ url: v.CONSOLE_ENGINE_URL as string, adminToken: null }))
        : settings(
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
    discovery: settings({ CONSOLE_DISCOVERY_URL: url(env, "CONSOLE_DISCOVERY_URL") }, (v) => ({
      url: v.CONSOLE_DISCOVERY_URL as string,
    })),
    applicationId: text(env, "CONSOLE_APPLICATION_ID") ?? "default",
    cacheTtlMs: number(env, "CONSOLE_CACHE_TTL_S", 15, 0, 300) * 1000,
    timeoutMs: number(env, "CONSOLE_TIMEOUT_S", 8, 1, 60) * 1000,
    maxListRows: number(env, "CONSOLE_MAX_LIST_ROWS", 20_000, 1000, 200_000),
    sessionSecret: secret(env, "CONSOLE_SESSION_SECRET"),
  };
}
