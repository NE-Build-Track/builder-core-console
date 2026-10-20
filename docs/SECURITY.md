# Security

## Trust boundaries

- **Browser ↔ console.** No sign-in in v1 (D7). The console is published on `127.0.0.1` only. Anyone
  who can reach that port sees every actor's spend and the stack's state, but can change nothing (D1).
- **Console ↔ engine.** The console holds an engine **admin** key. The engine has no read-only admin
  credential (gap G8), so the key could do anything; the console's code makes only GET requests, and
  `web/tests/structure/read-only.test.ts` keeps it that way.
- **Console ↔ Batteries.** The `console-reader` credential has only `*.read` permissions, so
  Batteries itself refuses any write.
- **Console ↔ signer.** Discovery and the metrics listener need no credential. The relay that exposes
  metrics is reachable only on the compose network.

## Credentials

| Credential | Where | Notes |
| --- | --- | --- |
| Engine admin key (`lpk_`) | `deploy/.env` `CONSOLE_ENGINE_ADMIN_TOKEN` | Printed once by `lpb bootstrap-admin`; revoke with `POST /v1/admin/keys/{id}/revoke` |
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

Add sign-in (tech debt T3) and put TLS in front of it. Prefer a reverse proxy with its own auth until
the console has one.
