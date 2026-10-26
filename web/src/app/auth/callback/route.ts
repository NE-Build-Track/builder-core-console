import { NextResponse, type NextRequest } from "next/server";

import { COOKIE_NAMES, finishSignIn, ID_COOKIE_NAMES, PENDING_COOKIE, SESSION_MAX_AGE_S } from "@/runtime/session";

/**
 * The identity provider sends the browser back here with a code. The console exchanges it on the server,
 * asks the engine, seals the session into the area's cookie and moves on to the area.
 *
 * The move is a page that navigates, not a redirect: this request arrived from the provider's site, so a
 * redirect would stay cross-site and the browser would withhold the new SameSite=Strict session cookie.
 */
function moveTo(path: string): NextResponse {
  const target = path.replace(/[^A-Za-z0-9/?=&%._~-]/g, "");
  const body = `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${target}"><title>Signing in…</title><p><a href="${target}">Continue</a></p>`;
  return new NextResponse(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const finished = await finishSignIn(request.nextUrl.searchParams, request.cookies.get(PENDING_COOKIE)?.value);
  const area = finished.area ?? "builder";
  const response = finished.ok ? moveTo(`/${area}`) : moveTo(`/${area}?signin=${encodeURIComponent(finished.message)}`);
  response.cookies.delete({ name: PENDING_COOKIE, path: "/auth/callback" });
  if (finished.ok) {
    const options = { httpOnly: true, sameSite: "strict", path: "/", maxAge: SESSION_MAX_AGE_S, secure: request.nextUrl.protocol === "https:" } as const;
    response.cookies.set(COOKIE_NAMES[area], finished.sealed, options);
    if (finished.sealedIdToken) response.cookies.set(ID_COOKIE_NAMES[area], finished.sealedIdToken, options);
  }
  return response;
}
