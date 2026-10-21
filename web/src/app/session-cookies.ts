import "server-only";

import { cookies, headers } from "next/headers";

import type { Area, Session } from "@/domain/session";
import { COOKIE_NAMES, openSession, SESSION_MAX_AGE_S } from "@/runtime/session";

/**
 * The writing areas' cookies (decision D16): httpOnly, SameSite=Strict, sealed by the runtime. Read at
 * request time, so callers sit inside a <Suspense> boundary (Cache Components).
 */

export async function sessionFor(area: Area): Promise<Session | null> {
  return openSession(area, (await cookies()).get(COOKIE_NAMES[area])?.value);
}

/** Secure when the browser reached the console over HTTPS; on 127.0.0.1 it is plain HTTP. */
async function overHttps(): Promise<boolean> {
  const list = await headers();
  return list.get("x-forwarded-proto") === "https" || (list.get("origin") ?? "").startsWith("https://");
}

export async function keepSession(area: Area, sealed: string): Promise<void> {
  (await cookies()).set(COOKIE_NAMES[area], sealed, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
    secure: await overHttps(),
  });
}

export async function endSession(area: Area): Promise<void> {
  (await cookies()).delete(COOKIE_NAMES[area]);
}
