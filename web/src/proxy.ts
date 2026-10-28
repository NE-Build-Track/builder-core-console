import { NextResponse, type NextRequest } from "next/server";

import { COOKIE_NAMES, openSession, refreshSession, SESSION_MAX_AGE_S } from "@/runtime/session";

/**
 * Keeps identity-provider sessions (CONSOLE_AUTH=oidc) alive: before a writing area renders, an access
 * token that expires within a minute is refreshed and the sealed cookie replaced, on the request (so this
 * render uses the new token) and on the response. A refresh the provider refuses ends the session.
 * Pasted-key sessions pass through untouched. Pages cannot set cookies while rendering, hence this file.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const changes: { readonly name: string; readonly sealed: string | null }[] = [];
  for (const area of ["operator", "builder"] as const) {
    const name = COOKIE_NAMES[area];
    const session = openSession(area, request.cookies.get(name)?.value);
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
  const response = NextResponse.next({ request: { headers: request.headers } });
  for (const change of changes) {
    if (change.sealed) {
      response.cookies.set(change.name, change.sealed, {
        httpOnly: true,
        sameSite: "strict",
        path: "/",
        maxAge: SESSION_MAX_AGE_S,
        secure: request.nextUrl.protocol === "https:",
      });
    } else {
      response.cookies.delete(change.name);
    }
  }
  return response;
}

export const config = { matcher: ["/operator/:path*", "/builder/:path*", "/operator", "/builder"] };
