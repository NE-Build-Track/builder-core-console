import "server-only";

import { cookies, headers } from "next/headers";

import { ENDED_MESSAGES, isEndReason, type Area, type EndReason, type Session } from "@/domain/session";
import { COOKIE_NAMES, ENDED_COOKIE_NAMES, ENDED_MAX_AGE_S, ID_COOKIE_NAMES, openSession, SESSION_MAX_AGE_S } from "@/runtime/session";

/**
 * The writing areas' cookies (decision D16): httpOnly, SameSite=Strict, sealed by the runtime. Read at
 * request time, so callers sit inside a <Suspense> boundary (Cache Components).
 */

export async function sessionFor(area: Area): Promise<Session | null> {
  return openSession(area, (await cookies()).get(COOKIE_NAMES[area])?.value);
}

/** Why the area's last session ended (ISS-21), for a signed-out page to say; null when it was not ended for it. */
export async function endedMessage(area: Area): Promise<string | null> {
  const reason = (await cookies()).get(ENDED_COOKIE_NAMES[area])?.value;
  return isEndReason(reason) ? ENDED_MESSAGES[reason] : null;
}

/** Secure when the browser reached the console over HTTPS; on 127.0.0.1 it is plain HTTP. */
async function overHttps(): Promise<boolean> {
  const list = await headers();
  return list.get("x-forwarded-proto") === "https" || (list.get("origin") ?? "").startsWith("https://");
}

export async function keepSession(area: Area, sealed: string): Promise<void> {
  const jar = await cookies();
  jar.delete(ENDED_COOKIE_NAMES[area]);
  jar.set(COOKIE_NAMES[area], sealed, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
    secure: await overHttps(),
  });
}

/** Ends the area's session; returns its sealed ID token (oidc), for the provider's logout. */
export async function endSession(area: Area): Promise<string | undefined> {
  const jar = await cookies();
  const idToken = jar.get(ID_COOKIE_NAMES[area])?.value;
  jar.delete(COOKIE_NAMES[area]);
  jar.delete(ID_COOKIE_NAMES[area]);
  jar.delete(ENDED_COOKIE_NAMES[area]);
  return idToken;
}

/** Ends the area's session because the engine stopped accepting its key, and says so to the next page (ISS-21). */
export async function endedBy(area: Area, reason: EndReason): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAMES[area]);
  jar.set(ENDED_COOKIE_NAMES[area], reason, { httpOnly: true, sameSite: "strict", path: "/", maxAge: ENDED_MAX_AGE_S, secure: await overHttps() });
}
