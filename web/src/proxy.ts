import { NextResponse, type NextRequest } from "next/server";

import type { Area, EndReason } from "@/domain/session";
import { COOKIE_NAMES, ENDED_COOKIE_NAMES, ENDED_MAX_AGE_S, endedKeySession, openSession, refreshSession, SESSION_MAX_AGE_S } from "@/runtime/session";

/**
 * Runs before a writing area renders. Pages cannot set cookies while rendering, hence this file.
 * - A pasted-key session (ISS-21): the page's area asks the engine once with the session's key. A 401
 *   (revoked, or expired at the engine) ends the session here: its cookie is cleared on the request (so
 *   this render is signed out) and on the response, and a short-lived cookie says why, for the sign-in
 *   form to show. A 403, a 5xx or no answer leaves the session alone.
 * - An identity-provider session (CONSOLE_AUTH=oidc): an access token that expires within a minute is
 *   refreshed and the sealed cookie replaced, on the request and on the response. A refresh the provider
 *   refuses ends the session.
 */

/** The area a page belongs to. The job run and the job poll are not pages: they answer a 401 themselves. */
function pageArea(pathname: string): Area | null {
  if (pathname === "/operator" || pathname.startsWith("/operator/")) return "operator";
  if (pathname === "/builder/run" || pathname.startsWith("/builder/api/")) return null;
  if (pathname === "/builder" || pathname.startsWith("/builder/")) return "builder";
  return null;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const secure = request.nextUrl.protocol === "https:";
  const changes: { readonly name: string; readonly sealed: string | null }[] = [];
  const endings: { readonly name: string; readonly reason: EndReason }[] = [];
  const area = pageArea(request.nextUrl.pathname);
  if (area) {
    const reason = await endedKeySession(area, request.cookies.get(COOKIE_NAMES[area])?.value);
    if (reason) {
      changes.push({ name: COOKIE_NAMES[area], sealed: null });
      endings.push({ name: ENDED_COOKIE_NAMES[area], reason });
    }
  }
  for (const each of ["operator", "builder"] as const) {
    const name = COOKIE_NAMES[each];
    if (changes.some((change) => change.name === name)) continue;
    const session = openSession(each, request.cookies.get(name)?.value);
    if (!session) continue;
    const result = await refreshSession(session);
    if (result === "fresh") continue;
    changes.push({ name, sealed: result?.sealed ?? null });
  }
  if (changes.length === 0) return NextResponse.next();
  for (const change of changes) {
    if (change.sealed) request.cookies.set(change.name, change.sealed);
    else request.cookies.delete(change.name);
  }
  for (const ending of endings) request.cookies.set(ending.name, ending.reason);
  const response = NextResponse.next({ request: { headers: request.headers } });
  for (const change of changes) {
    if (change.sealed) {
      response.cookies.set(change.name, change.sealed, { httpOnly: true, sameSite: "strict", path: "/", maxAge: SESSION_MAX_AGE_S, secure });
    } else {
      response.cookies.delete(change.name);
    }
  }
  for (const ending of endings) {
    response.cookies.set(ending.name, ending.reason, { httpOnly: true, sameSite: "strict", path: "/", maxAge: ENDED_MAX_AGE_S, secure });
  }
  return response;
}

export const config = { matcher: ["/operator/:path*", "/builder/:path*", "/operator", "/builder"] };
