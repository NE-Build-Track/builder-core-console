import "server-only";

import { keyedEngine } from "@/adapters/engine/keyed";
import { identityProvider } from "@/adapters/oidc/provider";
import { seal, unseal } from "@/adapters/seal";
import { readConfig, type OidcSettings } from "@/config/config";
import { describeProblem, type Reading } from "@/domain/reading";
import { isExpired, keyPrefix, looksLikeKey, needsRefresh, SESSION_HOURS, type Area, type EndReason, type Session } from "@/domain/session";
import type { IdentityProvider, PendingSignIn } from "@/ports/identity";
import { classifyKey, classifyPerson, standing } from "@/services/signin";

/**
 * Sign-in for the writing areas (decision D16). Two ways in, chosen by CONSOLE_AUTH:
 * - `keys` (default): the pasted key is checked against the engine, then sealed into the area's cookie.
 * - `oidc`: the identity provider's authorization-code flow with PKCE, run here on the server. The access
 *   and refresh tokens are sealed into the same cookie, refreshed by src/proxy.ts before they expire, and
 *   never reach the browser.
 * Cookies themselves are set by the app layer (Next.js owns them); this module only seals and opens.
 */

export const COOKIE_NAMES: Record<Area, string> = { operator: "bc_operator", builder: "bc_builder" };
/** oidc: the ID token, sealed in its own cookie (the session cookie has no room for it), for logout's id_token_hint. */
export const ID_COOKIE_NAMES: Record<Area, string> = { operator: "bc_operator_id", builder: "bc_builder_id" };
/** The sign-in in progress at the provider: state, nonce and PKCE verifier, sealed (SameSite=Lax: it comes back cross-site). */
export const PENDING_COOKIE = "bc_oidc_pending";
export const PENDING_MAX_AGE_S = 600;
export const SESSION_MAX_AGE_S = SESSION_HOURS * 3600;
/** Why the area's last session ended (ISS-21), for the sign-in form that follows; cleared on sign-in and sign-out. */
export const ENDED_COOKIE_NAMES: Record<Area, string> = { operator: "bc_operator_ended", builder: "bc_builder_ended" };
export const ENDED_MAX_AGE_S = 300;

export type SignInResult = { readonly ok: true; readonly sealed: string; readonly session: Session } | { readonly ok: false; readonly message: string };

export type AuthMode = "keys" | "oidc";

export function authMode(): AuthMode {
  return readConfig().auth.mode;
}

/** False when CONSOLE_SESSION_SECRET is missing, or the identity provider's settings are incomplete. */
export function signInEnabled(): boolean {
  const config = readConfig();
  if (config.sessionSecret === null) return false;
  return config.auth.mode === "keys" || config.auth.oidc.ok;
}

/** Why sign-in is off, for the page to say; null when it is on. */
export function signInOff(): string | null {
  const config = readConfig();
  if (config.sessionSecret === null) return "CONSOLE_SESSION_SECRET is not set";
  if (config.auth.mode === "oidc" && !config.auth.oidc.ok) return `the identity provider is not configured: ${config.auth.oidc.missing}`;
  return null;
}

export function engineUrl(): string | null {
  const engine = readConfig().engine;
  return engine.ok ? engine.value.url : null;
}

export function keyed(token: string, timeoutMs?: number) {
  const config = readConfig();
  const url = engineUrl();
  if (!url) return null;
  return keyedEngine(url, token, { timeoutMs: timeoutMs ?? config.timeoutMs, now: () => new Date() });
}

export async function signIn(area: Area, pasted: string, now: Date = new Date()): Promise<SignInResult> {
  const secret = readConfig().sessionSecret;
  if (!secret) return { ok: false, message: "Sign-in is off: set CONSOLE_SESSION_SECRET (deploy/first-run.sh writes one)." };
  if (authMode() === "oidc") return { ok: false, message: "This console signs in through the identity provider; engine keys are off." };
  const token = pasted.trim();
  if (!looksLikeKey(token)) return { ok: false, message: "That does not look like an engine key. Keys start with lpk_." };
  const engine = keyed(token);
  if (!engine) return { ok: false, message: "The console has no engine URL (CONSOLE_ENGINE_URL)." };
  const [adminKeys, jobs] = await Promise.all([engine.adminKeys(), engine.myJobs(1)]);
  const classified = classifyKey(area, adminKeys, jobs);
  if (!classified.ok) return classified;
  const session: Session = {
    area,
    token,
    ...classified.identity,
    prefix: keyPrefix(token),
    signedInAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_MAX_AGE_S * 1000).toISOString(),
    via: "key",
    name: null,
    refreshToken: null,
    tokenExpiresAt: null,
  };
  return { ok: true, sealed: seal(secret, session), session };
}

// -- the identity provider (CONSOLE_AUTH=oidc) --------------------------------------------------------

let provider: { readonly settings: OidcSettings; readonly value: IdentityProvider } | null = null;

function oidc(): { readonly settings: OidcSettings; readonly provider: IdentityProvider; readonly secret: string } | null {
  const config = readConfig();
  if (config.auth.mode !== "oidc" || !config.auth.oidc.ok || !config.sessionSecret) return null;
  const settings = config.auth.oidc.value;
  if (provider?.settings !== settings) {
    provider = { settings, value: identityProvider(settings, { timeoutMs: config.timeoutMs, now: () => new Date() }) };
  }
  return { settings, provider: provider.value, secret: config.sessionSecret };
}

function scopesFor(area: Area, settings: OidcSettings): readonly string[] {
  return area === "operator" ? [settings.operatorScope] : settings.builderScopes;
}

export type Begun = { readonly ok: true; readonly url: string; readonly sealedPending: string } | { readonly ok: false; readonly message: string };

/** Start a sign-in: where to send the browser, and the sealed state to keep until it comes back. */
export async function beginSignIn(area: Area): Promise<Begun> {
  const ready = oidc();
  if (!ready) return { ok: false, message: `Sign-in is off: ${signInOff() ?? "CONSOLE_AUTH is not oidc"}.` };
  const started = await ready.provider.begin(area, scopesFor(area, ready.settings));
  if (!started.ok) return { ok: false, message: `The identity provider could not be reached: ${describeProblem(started.problem)}.` };
  return { ok: true, url: started.value.url, sealedPending: seal(ready.secret, started.value.pending) };
}

function isPending(value: unknown, now: Date): value is PendingSignIn {
  if (value === null || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    (item.area === "operator" || item.area === "builder") &&
    typeof item.state === "string" &&
    typeof item.nonce === "string" &&
    typeof item.verifier === "string" &&
    typeof item.expiresAt === "string" &&
    Date.parse(item.expiresAt) > now.getTime()
  );
}

export type Finished =
  | { readonly ok: true; readonly area: Area; readonly sealed: string; readonly sealedIdToken: string | null; readonly session: Session }
  | { readonly ok: false; readonly message: string; readonly area: Area | null };

/** The provider sent the browser back: exchange the code, ask the engine, and seal the session. */
export async function finishSignIn(query: URLSearchParams, sealedPending: string | undefined, now: Date = new Date()): Promise<Finished> {
  const ready = oidc();
  if (!ready) return { ok: false, area: null, message: `Sign-in is off: ${signInOff() ?? "CONSOLE_AUTH is not oidc"}.` };
  const pending = sealedPending ? unseal(ready.secret, sealedPending) : null;
  if (!isPending(pending, now)) return { ok: false, area: null, message: "The sign-in took too long or was started in another browser. Try again." };
  const area = pending.area;
  const tokens = await ready.provider.finish(query, pending);
  if (!tokens.ok) return { ok: false, area, message: `The identity provider refused the sign-in: ${describeProblem(tokens.problem)}.` };
  const { accessToken, refreshToken, expiresAt, scopes, sub, name, idToken } = tokens.value;
  if (!sub) return { ok: false, area, message: "The identity provider's ID token names nobody (no sub)." };
  const engine = keyed(accessToken);
  if (!engine) return { ok: false, area, message: "The console has no engine URL (CONSOLE_ENGINE_URL)." };
  const probe = area === "operator" ? await engine.adminActors(1) : await engine.myJobs(1);
  const classified = classifyPerson(area, scopes, { operator: ready.settings.operatorScope, builder: ready.settings.builderScopes }, probe, { sub, name });
  if (!classified.ok) return { ...classified, area };
  const session: Session = {
    area,
    token: accessToken,
    ...classified.identity,
    prefix: name ?? sub,
    signedInAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_MAX_AGE_S * 1000).toISOString(),
    via: "oidc",
    name,
    refreshToken,
    tokenExpiresAt: expiresAt,
  };
  return { ok: true, area, sealed: seal(ready.secret, session), sealedIdToken: idToken ? seal(ready.secret, { area, idToken }) : null, session };
}

/** A refresh in flight or just done, by refresh token: parallel requests (a page and its prefetches) share one. */
const refreshing = new Map<string, Promise<{ readonly sealed: string; readonly session: Session } | null>>();
const REMEMBER_MS = 30_000;

/**
 * The session with a new access token when the old one is about to expire; null when the provider refused
 * the refresh (the session ended there). A session that needs no refresh is returned unchanged.
 */
export async function refreshSession(session: Session, now: Date = new Date()): Promise<{ readonly sealed: string; readonly session: Session } | null | "fresh"> {
  if (!needsRefresh(session, now)) return "fresh";
  const ready = oidc();
  if (!ready || !session.refreshToken) return null;
  const key = session.refreshToken;
  let pending = refreshing.get(key);
  if (!pending) {
    pending = ready.provider.refresh(key).then((tokens) => {
      if (!tokens.ok) return null;
      const next: Session = { ...session, token: tokens.value.accessToken, refreshToken: tokens.value.refreshToken ?? key, tokenExpiresAt: tokens.value.expiresAt };
      return { sealed: seal(ready.secret, next), session: next };
    });
    refreshing.set(key, pending);
    void pending.finally(() => setTimeout(() => refreshing.delete(key), REMEMBER_MS).unref());
  }
  return pending;
}

/**
 * Where to send the browser after signing out of an identity-provider session: the provider's logout,
 * which ends its single sign-on too (so the next person is asked to log in), then back to the area.
 */
export async function providerLogoutUrl(area: Area, sealedIdToken: string | undefined): Promise<string | null> {
  const ready = oidc();
  if (!ready) return null;
  const opened = sealedIdToken ? unseal(ready.secret, sealedIdToken) : null;
  const hint =
    opened !== null && typeof opened === "object" && (opened as Record<string, unknown>).area === area && typeof (opened as Record<string, unknown>).idToken === "string"
      ? ((opened as Record<string, unknown>).idToken as string)
      : null;
  return ready.provider.logoutUrl(new URL(`/${area}`, ready.settings.redirectUrl).href, hint);
}

function isSession(value: unknown, area: Area): value is Session {
  if (value === null || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    item.area === area &&
    typeof item.token === "string" &&
    (item.kind === "admin" || item.kind === "actor") &&
    typeof item.prefix === "string" &&
    typeof item.signedInAt === "string" &&
    typeof item.expiresAt === "string" &&
    (item.via === "key" || item.via === "oidc") &&
    (item.refreshToken === null || typeof item.refreshToken === "string") &&
    (item.tokenExpiresAt === null || typeof item.tokenExpiresAt === "string")
  );
}

/** The area's session from its sealed cookie, or null when there is none, it expired, or it was altered. */
export function openSession(area: Area, sealed: string | undefined, now: Date = new Date()): Session | null {
  const secret = readConfig().sessionSecret;
  if (!secret || !sealed) return null;
  const value = unseal(secret, sealed);
  if (!isSession(value, area) || isExpired(value, now)) return null;
  return value;
}

// -- a pasted key that stops working (ISS-21) ------------------------------------------------------------

/**
 * The probe runs in src/proxy.ts before the page renders, so it blocks the whole response: it gives up
 * sooner than a page's reads, and an engine that does not answer leaves the session alone.
 */
const PROBE_TIMEOUT_MS = 3000;

/** A probe in flight, by key: a page and its parallel requests share one call. Nothing is remembered after. */
const probing = new Map<string, Promise<Reading<unknown>>>();

/** The same cheap call sign-in uses to test a key: the actor list for an operator, one job for a builder. */
function probeKey(session: Session): Promise<Reading<unknown>> | null {
  const engine = keyed(session.token, Math.min(PROBE_TIMEOUT_MS, readConfig().timeoutMs));
  if (!engine) return null;
  const key = `${session.area}:${session.token}`;
  let pending = probing.get(key);
  if (!pending) {
    pending = session.area === "operator" ? engine.adminActors(1) : engine.myJobs(1);
    probing.set(key, pending);
    void pending.finally(() => probing.delete(key));
  }
  return pending;
}

/**
 * Why the area's pasted-key session has ended, or null while it stands (or there is none). The engine is
 * asked once with the session's key; only its 401 ends the session (services/signin.ts, `standing`).
 * Identity-provider sessions are left to refreshSession and their own expiry.
 */
export async function endedKeySession(area: Area, sealed: string | undefined, now: Date = new Date()): Promise<EndReason | null> {
  const secret = readConfig().sessionSecret;
  if (!secret || !sealed) return null;
  const value = unseal(secret, sealed);
  if (!isSession(value, area) || value.via !== "key") return null;
  const probe = isExpired(value, now) ? null : await probeKey(value);
  const result = standing(value, probe, now);
  return result.ended ? result.reason : null;
}
