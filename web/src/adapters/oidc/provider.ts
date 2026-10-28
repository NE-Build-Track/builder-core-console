import "server-only";

import * as oidc from "openid-client";

import type { OidcSettings, ReaderSettings } from "@/config/config";
import { failed, ok, type Problem, type Reading } from "@/domain/reading";
import type { Area } from "@/domain/session";
import type { IdentityProvider, PendingSignIn, SignInStarted, Tokens, TokenSource } from "@/ports/identity";

type Options = { readonly timeoutMs: number; readonly now: () => Date };

/** How long a begun sign-in may take at the provider before its pending cookie is refused. */
const PENDING_MINUTES = 10;
/** PKCE with SHA-256, never "plain". */
const PKCE_METHOD = "S256";

/**
 * The identity provider through openid-client (OpenID-certified; confined to this folder). Discovery is
 * read once and kept; a failed discovery is tried again on the next call. Errors become Readings with the
 * provider's `error` and `error_description`, never a token.
 */
function configuration(issuer: string, clientId: string, clientSecret: string, allowHttp: boolean, options: Options) {
  let found: Promise<oidc.Configuration> | null = null;
  return (): Promise<oidc.Configuration> => {
    found ??= oidc
      .discovery(new URL(issuer), clientId, clientSecret, undefined, {
        ...(allowHttp ? { execute: [oidc.allowInsecureRequests] } : {}),
        timeout: Math.ceil(options.timeoutMs / 1000),
      })
      .catch((error: unknown) => {
        found = null;
        throw error;
      });
    return found;
  };
}

function problemOf(error: unknown): Problem {
  if (error instanceof oidc.ResponseBodyError) return { kind: "http", status: error.status, detail: `${error.error}${error.error_description ? `: ${error.error_description}` : ""}` };
  if (error instanceof oidc.AuthorizationResponseError) return { kind: "http", status: 400, detail: `${error.error}${error.error_description ? `: ${error.error_description}` : ""}` };
  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error && error.cause instanceof Error ? ` (${error.cause.message})` : "";
  return { kind: "unreachable", detail: `${message}${cause}`.slice(0, 300) };
}

function tokensOf(response: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers, now: Date): Tokens {
  const claims = response.claims();
  const name = claims && typeof claims.preferred_username === "string" ? claims.preferred_username : claims && typeof claims.name === "string" ? claims.name : null;
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token ?? null,
    expiresAt: new Date(now.getTime() + (response.expiresIn() ?? 60) * 1000).toISOString(),
    scopes: (response.scope ?? "").split(" ").filter(Boolean),
    sub: claims?.sub ?? null,
    name,
    idToken: response.id_token ?? null,
  };
}

export function identityProvider(settings: OidcSettings, options: Options): IdentityProvider {
  const config = configuration(settings.issuer, settings.clientId, settings.clientSecret, settings.allowHttp, options);
  const at = () => options.now().toISOString();

  async function attempt<T>(work: (c: oidc.Configuration) => Promise<T>): Promise<Reading<T>> {
    try {
      return ok("identity", await work(await config()), at());
    } catch (error) {
      return failed("identity", problemOf(error), at());
    }
  }

  return {
    begin: (area: Area, scopes: readonly string[]) =>
      attempt(async (c): Promise<SignInStarted> => {
        const verifier = oidc.randomPKCECodeVerifier();
        const pending: PendingSignIn = {
          area,
          state: oidc.randomState(),
          nonce: oidc.randomNonce(),
          verifier,
          expiresAt: new Date(options.now().getTime() + PENDING_MINUTES * 60_000).toISOString(),
        };
        const url = oidc.buildAuthorizationUrl(c, {
          redirect_uri: settings.redirectUrl,
          scope: ["openid", ...scopes].join(" "),
          code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
          code_challenge_method: PKCE_METHOD,
          state: pending.state,
          nonce: pending.nonce,
          // Always ask who is signing in: each area is entered as a role, and silently reusing the
          // provider's session could sign in whoever used this browser last (an operator, as a builder).
          prompt: "login",
        });
        return { url: url.href, pending };
      }),
    finish: (query, pending) =>
      attempt(async (c) => {
        // The callback as registered, with the provider's query: the request's own URL may name the
        // container's address, not the one the browser used.
        const callback = new URL(settings.redirectUrl);
        callback.search = query.toString();
        const response = await oidc.authorizationCodeGrant(c, callback, {
          pkceCodeVerifier: pending.verifier,
          expectedState: pending.state,
          expectedNonce: pending.nonce,
          idTokenExpected: true,
        });
        return tokensOf(response, options.now());
      }),
    refresh: (refreshToken) => attempt(async (c) => tokensOf(await oidc.refreshTokenGrant(c, refreshToken), options.now())),
    logoutUrl: async (after, idTokenHint) => {
      try {
        const c = await config();
        if (!c.serverMetadata().end_session_endpoint) return null;
        const parameters: Record<string, string> = { client_id: settings.clientId, post_logout_redirect_uri: after };
        if (idTokenHint) parameters.id_token_hint = idTokenHint;
        return oidc.buildEndSessionUrl(c, parameters).href;
      } catch {
        return null;
      }
    },
  };
}

/**
 * The console's own read-only token (client credentials), kept until a minute before it expires and
 * shared by concurrent reads, so a page of reads asks the provider once.
 */
export function readerTokens(issuer: string, settings: ReaderSettings, allowHttp: boolean, options: Options): TokenSource {
  const config = configuration(issuer, settings.clientId, settings.clientSecret, allowHttp, options);
  let held: { readonly token: string; readonly until: number } | null = null;
  let inFlight: Promise<Reading<string>> | null = null;
  const at = () => options.now().toISOString();

  async function fetchToken(): Promise<Reading<string>> {
    try {
      const response = await oidc.clientCredentialsGrant(await config(), { scope: settings.scope });
      const lifetime = response.expiresIn() ?? 60;
      held = { token: response.access_token, until: options.now().getTime() + Math.max(0, lifetime - 60) * 1000 };
      return ok("identity", response.access_token, at());
    } catch (error) {
      return failed("identity", problemOf(error), at());
    }
  }

  return {
    token() {
      if (held && options.now().getTime() < held.until) return Promise.resolve(ok("identity", held.token, at()));
      inFlight ??= fetchToken().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
  };
}
