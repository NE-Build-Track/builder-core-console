# Reliability

## Configuration

The console reads `CONSOLE_*` variables (compose sets the URLs; `deploy/.env` holds the rest):

| Variable | Default | Purpose |
| --- | --- | --- |
| `CONSOLE_ENGINE_URL` | compose: `http://engine:8080` | The engine |
| `CONSOLE_ENGINE_ADMIN_TOKEN` | — | `lpk_` admin key (`first-run.sh`) |
| `CONSOLE_BATTERIES_URL` | compose: `http://clearinghouse:8081` | Batteries management API |
| `CONSOLE_BATTERIES_TOKEN` | — | `console-reader` token (`*.read`) |
| `CONSOLE_SIGNER_URL` | compose: `http://clearinghouse:8937` | The signer's signing port. The console reads nothing there (the signer only signs, builder-core D43) |
| `CONSOLE_DISCOVERY_URL` | compose: `http://discovery:8939` | The discovery service's `GET /discovery` (Network page, nav count) |
| `CONSOLE_SIGNER_METRICS_URL` | compose: `http://clearinghouse:8939` | Signer `/readyz` and `/metrics` via the relay |
| `CONSOLE_APPLICATION_ID` | `default` | The application the admin key reads (gap G9) |
| `CONSOLE_CACHE_TTL_S` | `15` (0–300) | How long one upstream read is reused |
| `CONSOLE_TIMEOUT_S` | `8` (1–60) | Per-request upstream timeout |
| `CONSOLE_SESSION_SECRET` | — (32+ characters) | Seals Operator and Builder sign-ins (D16). Without it, sign-in is off and the console is read-only |
| `CONSOLE_MAX_LIST_ROWS` | `20000` | Row cap per Batteries list (gap G6) |

A missing variable does not stop the console: that source reads "not configured: NAME" on every page.

## Failure behaviour

- One source down never blanks a page: every read is a `Reading` (value or named problem), rendered
  where it would have appeared.
- Upstream reads time out after `CONSOLE_TIMEOUT_S`. A page waits at most one timeout per sequential
  read; Users reads actors four at a time.
- The console keeps no state. Restarting it loses only the 15-second cache.
- `/livez` is process liveness and reads nothing upstream; the compose healthcheck uses it.

## Per-worktree dev

`make dev` runs `next dev` on a port derived from the folder name (3100–3899), so several worktrees
can run side by side. Point it at a stack with `web/.env.local` (the `CONSOLE_*` variables, with
`127.0.0.1:8090` for the engine; Batteries and the signer are not published to the host, so a dev
console against compose reads them as unreachable unless you add a port mapping locally).

## Operating the stack

See [deploy/README.md](../deploy/README.md): images, first run, start and stop, logs, resets.
