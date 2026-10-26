/**
 * Providers layer for signing in through an identity provider (CONSOLE_AUTH=oidc): the console is an
 * OpenID Connect client that runs the authorization-code flow with PKCE on the server and keeps the
 * tokens sealed in the area's cookie, like a pasted key (decision D16). `TokenSource` is the console's
 * own read-only identity for the background reads, a client-credentials token.
 */
import type { Reading } from "@/domain/reading";
import type { Area } from "@/domain/session";

/** What must survive the round trip through the provider, sealed in a short-lived cookie. */
export type PendingSignIn = { readonly area: Area; readonly state: string; readonly nonce: string; readonly verifier: string; readonly expiresAt: string };

export type SignInStarted = { readonly url: string; readonly pending: PendingSignIn };

/** The provider's answer: the access token for the engine, and who the person is (from the ID token). */
export type Tokens = {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly expiresAt: string;
  readonly scopes: readonly string[];
  readonly sub: string | null;
  readonly name: string | null;
};

export interface IdentityProvider {
  /** Where to send the browser for `area`, asking for `scopes`. */
  begin(area: Area, scopes: readonly string[]): Promise<Reading<SignInStarted>>;
  /** Exchange the code the provider sent back to /auth/callback (`query` is that request's query string). */
  finish(query: URLSearchParams, pending: PendingSignIn): Promise<Reading<Tokens>>;
  /** A new access token before the old one expires. `sub` and `name` stay with the session. */
  refresh(refreshToken: string): Promise<Reading<Tokens>>;
  /** The provider's logout page, which returns to `after`; null when it has none. */
  logoutUrl(after: string): Promise<string | null>;
}

export interface TokenSource {
  token(): Promise<Reading<string>>;
}
