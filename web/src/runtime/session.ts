import "server-only";

import { keyedEngine } from "@/adapters/engine/keyed";
import { seal, unseal } from "@/adapters/seal";
import { readConfig } from "@/config/config";
import { isExpired, keyPrefix, looksLikeKey, SESSION_HOURS, type Area, type Session } from "@/domain/session";
import { classifyKey } from "@/services/signin";

/**
 * Sign-in for the writing areas (decision D16). The pasted key is checked against the engine, then
 * sealed into the area's cookie; pages and actions open that cookie on every request. Cookies themselves
 * are set by the app layer (Next.js owns them); this module only seals and opens.
 */

export const COOKIE_NAMES: Record<Area, string> = { operator: "bc_operator", builder: "bc_builder" };
export const SESSION_MAX_AGE_S = SESSION_HOURS * 3600;

export type SignInResult = { readonly ok: true; readonly sealed: string; readonly session: Session } | { readonly ok: false; readonly message: string };

/** False when CONSOLE_SESSION_SECRET is missing: the writing areas then say how to turn sign-in on. */
export function signInEnabled(): boolean {
  return readConfig().sessionSecret !== null;
}

export function engineUrl(): string | null {
  const engine = readConfig().engine;
  return engine.ok ? engine.value.url : null;
}

export function keyed(token: string) {
  const config = readConfig();
  const url = engineUrl();
  if (!url) return null;
  return keyedEngine(url, token, { timeoutMs: config.timeoutMs, now: () => new Date() });
}

export async function signIn(area: Area, pasted: string, now: Date = new Date()): Promise<SignInResult> {
  const secret = readConfig().sessionSecret;
  if (!secret) return { ok: false, message: "Sign-in is off: set CONSOLE_SESSION_SECRET (deploy/first-run.sh writes one)." };
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
  };
  return { ok: true, sealed: seal(secret, session), session };
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
    typeof item.expiresAt === "string"
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
