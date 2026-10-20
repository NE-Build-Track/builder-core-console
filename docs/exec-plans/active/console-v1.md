# Console v1: a read-only view of one builder stack

## Status

Owner: Mike. State: **scaffolded 20 October 2026; awaiting Mike's review.** Nothing is committed.

## Goal

Stand up the builder stack (Batteries, the signer and the stock builder-core engine) as Docker
services the way ChatLPT runs its payment stack, and a Next.js console that shows that stack's health,
network, money, users, usage and jobs from what the components expose today, changing nothing. Record
everything the console cannot show as a gap with its fix.

## Acceptance

- [x] `deploy/compose.yaml` builds clearinghouse, signer and engine from the pins ChatLPT and builder-core use, plus the console.
- [x] Same env names and secret values as ChatLPT; `init-secrets.py` adds only a read-only Batteries credential.
- [x] `first-run.sh` fills `deploy/.env` (tokens, `LPB_SECRET_KEY`, the engine admin key) without starting the signer.
- [x] Seven pages: Health, Network, Money, Users, Usage, Jobs, Sources and gaps.
- [x] Read-only by construction: structural test for GET-only adapters, no write handlers, actions or posting forms.
- [x] Layers, third-party confinement, server-only, taste, pins and doc sync enforced by `web/tests/structure/`.
- [x] Gaps G1–G10 recorded in code and docs, cited on the pages they limit.
- [x] Console, engine and Batteries run together and every page renders against them (20 October, signer off).
- [x] Full stack with the signer running (20 October, after ChatLPT's stack was stopped): signer ready, discovery fresh, five orchestrators, 92 apps.
- [x] The accepted mock applied as the console's design (D14).
- [x] Pages checked in headless Chromium: light and dark at 1280 px, light at 390 px; no console errors, no horizontal page overflow (20 October).
- [ ] Keyboard-only and screen-reader pass.
- [x] Paid traffic through every page, with evidence.
- [ ] Mike's review.

## Progress

- [x] 2026-10-20 Repository scaffolded per the harness layout; decisions D1–D13 recorded.
- [x] 2026-10-20 Batteries and signer response shapes captured read-only from ChatLPT's live stack; used for zod schemas and test fixtures.
- [x] 2026-10-20 Images built: `builder-console/clearinghouse:ca09e47`, `engine:a89216d`, `console:local` (and `node:406b248`).
- [x] 2026-10-20 `first-run.sh` run: admin key issued, `deploy/.env` filled. Engine reports `0.0.1.dev1+ga89216db9`.
- [x] 2026-10-20 `make check` green: typecheck, lint, unit and structural tests, compose config. `next build` green.
- [x] 2026-10-20 Seeded a $1 grant and one actor in the local Batteries; Money, Users and Health (Balanced) render them. Screenshots in `.local/shots/` (git-ignored).
- [x] 2026-10-20 Mock accepted; design ported (globals.css from the mock, components on live data, React view transitions, ⌘K palette, theme toggle). 88 tests, lint, build green.
- [x] 2026-10-20 Full stack up with the signer: Health shows Operational with every check passing; Network shows 92 apps on 5 orchestrators. Found and fixed: the relay's YAML command split on commas.
- [x] 2026-10-20 Paid multi-actor traffic (`scripts/demo-traffic.py`): five actors, two grants, 58 jobs, all balanced; [evidence](../../references/evidence/2026-10-20-demo-traffic.md).
- [x] 2026-10-20 Usage day windows aligned to UTC calendar days (the chart's last day is today); grant cards and the ledger re-laid out for real data.

## Decision log

- 2026-10-20 D14: Mike accepted the design mock ("I LOVE the ui - lets use it and apply it"). Tailwind's `ring` utility and `spin` keyframes collided with the mock's names; renamed (`.gauge`, `bc-` keyframes) and guarded by a structural test.
- 2026-10-20 D1–D13 accepted in conversation with Mike ([decisions.md](../../design-docs/decisions.md)).
- 2026-10-20 The signer refuses non-loopback metrics binds (`signer/app.go:103` at 406b248), so metrics go through a socat relay (D10, gap G5) instead of a config change.
- 2026-10-20 Engine admin reads (allowance, cost summary) are scoped to the admin key's application (`services/payments.py` at a89216d); the console reads money for `CONSOLE_APPLICATION_ID` only (gap G9).
- 2026-10-20 In per_actor mode the engine answers 404 to an application-wide reconciliation (`GET /v1/admin/reconciliation` without `actor_id`). The Health check sums every actor's reconciliation instead (gap G10).
- 2026-10-20 `POST /v1/admin/grants` with an amount fails with `provider HTTP 403` under ChatLPT's credentials (the grant desk lacks `grants.fund`). Grants are created with the Batteries CLI, as ChatLPT does; recorded in gaps.md and deploy/README.md. A $1 grant `console-smoke` and actor `smoke-actor` ($0.25) were created in this stack's fresh local Batteries to check the Money and Users pages; `docker compose -f deploy/compose.yaml down -v` removes them.
