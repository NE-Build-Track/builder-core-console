# Security

## Trust boundaries

- **Browser ↔ console.** The read-only pages need no sign-in (D7); the console is published on
  `127.0.0.1` only. Anyone who can reach that port sees every actor's spend and the stack's state.
  Changing anything needs a sign-in to a writing area with an engine key (D16): an admin key for
  Operator actions, an actor key for the Builder.
- **Sessions.** The pasted key is checked against the engine, then sealed (AES-256-GCM under
  `CONSOLE_SESSION_SECRET`) into an httpOnly, `SameSite=Strict` cookie for 8 hours; the browser cannot
  read it and the server stores nothing. Server actions are origin-checked by Next.js; the Builder's
  run endpoint checks `Origin` itself. Sign-out deletes the cookie; a revoked key fails on its next call.
- **Console ↔ engine.** The pages read with the console's own **admin** key, which could do anything
  (gap G8): only GET leaves the read path, and `web/tests/structure/writes.test.ts` keeps writes in two
  adapters used only by the writing areas, which send them with the **signed-in** key, never the console's.
- **Signing in through an identity provider (D21, `CONSOLE_AUTH=oidc`).** The console runs the
  authorization-code flow with PKCE on the server; the state, nonce and verifier wait in a sealed,
  `SameSite=Lax` cookie scoped to `/auth/callback` for 10 minutes. The access and refresh tokens are sealed
  into the area's cookie like a key, never reach the browser, and are refreshed by `src/proxy.ts` before
  they expire; a refused refresh ends the session. The provider decides who may enter which area by the
  scopes it grants, and the engine checks every token itself (`LPB_AUTH=jwt`). The read path uses the
  console's own client-credentials token, which the engine maps to a read-only auditor, so no admin
  credential sits in the console at all.
- **New keys.** An issued key is shown once, in the result of the action that made it, and is never
  stored, logged or shown in a request panel (keys there are replaced by `lpk_…(hidden)`).
- **Console ↔ Batteries.** The `console-reader` credential has only `*.read` permissions, so
  Batteries itself refuses any write.
- **Console ↔ signer.** Discovery and the metrics listener need no credential. The relay that exposes
  metrics is reachable only on the compose network.

## Credentials

| Credential | Where | Notes |
| --- | --- | --- |
| Engine admin key (`lpk_`) | `deploy/.env` `CONSOLE_ENGINE_ADMIN_TOKEN` | Printed once by `lpb bootstrap-admin`; revoke with `POST /v1/admin/keys/{id}/revoke` |
| Session secret | `deploy/.env` `CONSOLE_SESSION_SECRET` | Seals sign-ins; written by `first-run.sh`; changing it signs everyone out |
| Signed-in keys | the area's sealed cookie only | Never stored on the server or written to a log |
| Batteries `console-reader` | `deploy/secrets/console-reader-token`, `deploy/.env` | `*.read` only |
| Batteries engine and grant-desk tokens | `deploy/secrets/`, `deploy/.env` (`LPB_*`) | The engine's, as in ChatLPT |
| Payer keystore, password, RPC URL | `deploy/secrets/` | The signer's; the same payer as ChatLPT |

- Every module that can see a credential (`config/`, `adapters/`, `runtime/`) starts with
  `import "server-only"`; a client component importing them fails the build and a structural test.
- `deploy/.env` and `deploy/secrets/` are git-ignored and mode 0600/0700. The Docker build context
  excludes them (`.dockerignore`).
- Credentials never reach a page, a log line or an error message: problems carry the upstream's
  status and first error line, never request headers.

## Before exposing the console beyond loopback

Put TLS in front of it (the session cookie is marked Secure over HTTPS) and protect the read-only pages
too: they need no sign-in. Prefer a reverse proxy with its own auth until the pages have one.
