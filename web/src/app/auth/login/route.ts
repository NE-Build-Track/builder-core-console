import { NextResponse, type NextRequest } from "next/server";

import { beginSignIn, PENDING_COOKIE, PENDING_MAX_AGE_S } from "@/runtime/session";

/**
 * Start signing in through the identity provider (CONSOLE_AUTH=oidc): /auth/login?area=operator|builder.
 * The state, nonce and PKCE verifier go into a sealed cookie; the browser goes to the provider.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const area = request.nextUrl.searchParams.get("area") === "operator" ? "operator" : "builder";
  const begun = await beginSignIn(area);
  if (!begun.ok) return NextResponse.redirect(new URL(`/${area}?signin=${encodeURIComponent(begun.message)}`, request.url), 303);
  const response = NextResponse.redirect(begun.url, 303);
  response.cookies.set(PENDING_COOKIE, begun.sealedPending, {
    httpOnly: true,
    sameSite: "lax", // it must come back on the provider's cross-site redirect to /auth/callback
    path: "/auth/callback",
    maxAge: PENDING_MAX_AGE_S,
    secure: request.nextUrl.protocol === "https:",
  });
  return response;
}
