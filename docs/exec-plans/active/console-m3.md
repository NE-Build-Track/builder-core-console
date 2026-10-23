# Console M3: the reference app for the complete builder journey

## Status

Owner: Mike (built by an agent under his review). State: **phases 0–4 built 21 October 2026, committed locally on
`m3/reference-app`; awaiting Mike's code walkthrough.** Dry run and final run to come. M3 gate 20 November 2026 ([epic #20](https://github.com/Cloud-SPE/Network-Engineering-SPE/issues/20),
[decision record](https://github.com/Cloud-SPE/Network-Engineering-SPE/blob/main/docs/decisions/2026-10-21-m3-reference-app-and-scope.md)).
Tentative checkpoints: console areas complete 6 Nov, dry run 13 Nov, gate 20 Nov.

## Goal

Turn the read-only console into the M3 reference app (D15): keep its pages as they are, and add
**Operator actions** (admin key) and a **Builder** area (actor key) that drive the engine's REST API,
so one minimum app demonstrates the seven builder outcomes with funded chat and image jobs and their
network cost. Every write is deliberate (D17) and shows its REST call (D18); the job form is generic
and fed by the live catalog (D19, D20). The same work produces the M3 environment write-up (ISS-13),
the job selection (ISS-19), the journey guide (ISS-24) and the funded proof (ISS-25).

## Acceptance

Each item names the M3 task it evidences.

- [x] The stack and console pin builder-core `93756ba` (the PR #28 review fixes), then the merge commit on `releases/m3` (`ad6bba9`, 21 October); the engine spec in `openapi/` is regenerated at that pin.
- [x] Sign-in by pasting a key (D16): admin or actor, checked against the engine, held in a sealed httpOnly `SameSite=Strict` cookie the browser cannot read; sign-out; an expired or revoked key ends the session with a clear message. The read-only pages keep working without sign-in (D7). (ISS-21)
- [x] Write plumbing: an `EngineWriter` port and adapter, the only code that sends non-GET requests; every write returns an exchange (method, path, body, status, response, keys redacted) for the request panel with copy as `curl` (D18). The structural tests change from "never writes" to "writes only through the writer, only from the Operator and Builder areas". (ISS-20)
- [x] The fill in → review → result flow (D17) as one reusable form pattern: review shows before → after for money moves, typed key prefix for revocations, a new key shown once, a result toast and refreshed section; a generated operation reference on every admin call that accepts one. (ISS-20)
- [ ] Operator actions (ISS-20, ISS-08 and ISS-11 from the app side): create a grant; fund a grant; provision an actor with an allocation; fund an allocation; set allocation status; rotate an allocation's payment key; revoke an allocation; issue and revoke access keys **(all done)**; inspect and rotate access keys once the engine has them (ISS-08, waiting on John).
- [x] Builder catalog (ISS-21, ISS-10 display): offerings and runners from the engine with each rate's amount, currency, unit, source and age, stale or missing rates marked, "wholesale network rate" stated, no hand-kept entries.
- [x] Builder job form and output (ISS-22, D19, D20): offering, path, JSON input with chat and image presets, options; the job runs from the server and streams to the browser; Rendered (chat), JSON with images, `image/*`, and Raw views; failures show kind, message and whether payment went out.
- [x] Builder job record (ISS-22): live state, attempts with orchestrator and payment, result reference, and network cost followed from `pending` to its final class.
- [x] Builder history and usage (ISS-22, outcome 7): my jobs, my allowance, my cost summary by class, wholesale only.
- [x] ISS-13 write-up: the console's stack in `deploy/` (the M3 dev stack: builder-core's engine, Batteries and the signer at pinned commits, plus the console) documented as the funded configuration: endpoints, scoped credentials, allocation setup, who funds the signer, accounting access, and the one-signer-per-payer rule.
- [x] ISS-19 document: chat (Qwen, streamed) and image (FLUX schnell) with inputs, expected observations and pinned versions; the seven-outcome journey; the M4 matrix (async, persistent endpoints, MCP, embedded vs service, enterprise auth, the second payment configuration).
- [x] ISS-24 guide: the README takes a reviewer from install to the full journey, linking builder-core's install docs and the embedded walkthrough, with no secrets.
- [x] Checked in headless Chromium (light and dark, 1280 px and 390 px: no overflow, no console errors) and with the keyboard (dialogs open with Enter, focus the first field, close with Escape and return focus); tests, lint, typecheck, build and compose config green. A screen-reader pass is still to do.
- [ ] Dry run of the journey by 13 November, with the expected cost stated first.
- [ ] ISS-25 final run on merged code: evidence linking the builder key, live discovery and rate, both jobs, results, usage and final network-cost classes; operator funding shown; spend under $1 across all runs.
- [ ] Mike's review.

## Progress

- [x] 2026-10-21 Plan written from the M3 decisions (console D15–D20, decision record above). Mike approved it and asked for every phase to be built now, committed locally, for his review at the end.
- [x] 2026-10-21 Phase 1–2 (`aff699c`): key sign-in sealed in httpOnly cookies, the writer and keyed engine, the request panel with copy as curl, the three-step dialog, and the Operator page; `read-only.test.ts` replaced by `writes.test.ts`.
- [x] 2026-10-21 Phase 3 (`c7bd1ad`, `c78792f`): the Builder (catalog, generic job form with streamed output, job record polled until its cost settles, my jobs, usage), driven in headless Chromium. Fixed on the way: duplicate field ids across dialogs, an uncentred dialog, nested forms, a result unmounted by the page refresh, output views carried from one run to the next, rates shown in raw wei.
- [x] 2026-10-21 Paid build tests on the dev stack, within the $0.50 build budget: two streamed chats ($0.000111 each, observed) and three images ($0.003007 each, observed), $0.0092 in all, matching the actor's spent allowance. Cost moved from pending to observed within a minute each time.
- [x] 2026-10-21 Phase 4: the ISS-13 write-up ([m3-environment.md](../../references/m3-environment.md)), the ISS-19 document ([m3-journey.md](../../product-specs/m3-journey.md)), the ISS-24 guide ([guides/m3-journey.md](../../guides/m3-journey.md)); README, AGENTS, ARCHITECTURE, SECURITY, FRONTEND, RELIABILITY, QUALITY_SCORE and the console spec updated; full stack rebuilt in Docker and checked in both themes at both widths.
- [x] 2026-10-21 Re-pinned to `ad6bba9`, the merge of builder-core PR #28 and PR #31 on `releases/m3` (gateway `3238731`, D41). Tested first at `7757f6e` (the same code) through the console: a streamed chat ($0.000111) whose first attempt hit a self-signed runner (`unreachable`, not paid) and failed over to a runner with a CA-signed certificate, and an image ($0.0030); both paid once, observed. The engine now verifies runner TLS; three approved orchestrators had rotated their self-signed certificates since 20 October, so `pin-orchestrator-certs.py` was re-run for the signer.
- [x] 2026-10-23 Re-pinned to `165e601`, builder-core's dependency-injection refactor (branch `tasks/mz/dependency-injection-refactor`, the commit ChatLPT pins). The stock server's API is unchanged apart from the bearer scheme the spec now declares, so Swagger's Authorize works; the regenerated types are identical. The grant desk stays on because this stack sets `LPB_BATTERIES_OPERATOR_TOKEN` (it is optional in the engine now). The test fixtures take the engine version from `PINS`. `make check` passes. Shown on the stack the same day, with all four images rebuilt from their pins: the engine reports `0.0.1.dev1+g165e60192` and logs `api_keys: on, grant_desk: on`; its spec declares `HTTPBearer`; the calls sign-in makes answer as before (admin key: `GET /v1/admin/keys` 200 and `GET /v1/jobs` 200; an actor key: 403 and 200); the grant desk lists the 4 grants; an operator write issued a key (201), revoked it (204), and the revoked key gets 401; `/operator`, `/builder` and `/sources` render (200).
- [x] 2026-10-23 Re-pinned to `a22bc98`: builder-core's PR #41 review fixes and doc sweep, the commit ChatLPT pins. The engine spec and the generated types are unchanged.
- [x] 2026-10-23 Re-pinned to `b89c1bb`, the merge of builder-core PR #41 on `releases/m3` (the same code as `a22bc98`, which was shown live: console API 33/33, engine sweep 42/42).
- [x] 2026-10-23 Re-pinned to `878e4f4`, the merge of builder-core PR #42 (FakeEngine and test changes only; the stock server is unchanged).
- [x] 2026-10-21 Phase 0: re-pinned to `93756ba` (image `builder-console/engine:93756ba`, which reports `0.0.1.dev1+g93756ba27`); the engine spec is identical at both commits, so the generated types are unchanged. Grant creation through the engine failed both ways (an amount: Batteries 403 for the grant desk; no amount: the engine refuses), so `init-secrets.py` now gives this stack's grant desk `grants.fund`; a $1 grant was then created and funded $0.50 twice under one operation reference, which applied once ($1.50). The create response lacks name, status and total: gap G12.

### Phases

| Phase | Work | Target |
| --- | --- | --- |
| 0 | Commit D15–D20; re-pin to `93756ba` (images, `openapi/` spec, `domain/pins.ts`, compose, `payment-stack.md`); confirm the Batteries credential can fund grants (see risks) | 22 Oct |
| 1 | Sign-in and sessions; `EngineWriter` and exchanges; request panel; review flow; structural tests rewritten | 27 Oct |
| 2 | Operator actions | 30 Oct |
| 3 | Builder: catalog, job form, streaming output views, job record, history and usage | 5 Nov |
| — | **Checkpoint: console areas complete** | **6 Nov** |
| 4 | ISS-13 write-up, ISS-19 document, ISS-24 guide; browser and keyboard pass | 12 Nov |
| 5 | Dry run (expected cost stated first) | **13 Nov** |
| 6 | Re-pin to the merge commit; final funded run; evidence | **by 20 Nov** |

### Design notes

- **Routes.** Operator actions live on their own page, `/operator`, with each row carrying its actions; the Builder under `/builder` (catalog and run, `jobs`, `usage`). The read-only pages keep their routes and stay free of write paths (changed from the first draft, which put actions on the Money cards; see the decision log).
- **Writes.** Operator forms are native `<form method="post">` bound to server actions (Next's origin check applies); step one returns the review, step two commits. The job run is a `POST` route handler that streams the engine's response to the browser; it checks `Origin` and the session itself.
- **Sessions.** The cookie holds the key sealed with AES-256-GCM under `CONSOLE_SESSION_SECRET` (new, written by `first-run.sh`), plus its kind, actor and application, and expires after 8 hours. Nothing is stored server-side (D6).
- **Layers.** New ports `EngineWriter` (admin) and `BuilderEngine` (actor-scoped reads and the job run) in `ports/`; adapters in `adapters/engine/`; services stay pure and fixture-tested. `layers.test.ts` gains the two areas; `read-only.test.ts` becomes `writes.test.ts`.
- **Operation references.** Generated when the form renders and kept through review and retry. Fund grant, fund allocation and rotate payment key accept one today; provision, issue key, create grant and status do not yet (ISS-11, John). Until they do, their review step says a repeat could apply twice.

### Depends on John (engine)

| Need | Task | Without it |
| --- | --- | --- |
| Access-key inspect and rotate | ISS-08 | Operator actions offer revoke and issue instead |
| Operation references on every admin write | ISS-11 | The review step warns that a repeat could apply twice |
| Capability input descriptions | builder-core #18 | Chat and image presets; other offerings start from `{}` |
| Rate source and age on offerings | ISS-10 | The console shows what the engine gives and marks the rest unknown |
| PR #28 merged into `releases/m3` | streaming | The final run cannot use streamed chat |

### Risks

- ~~**Grant funding.**~~ Resolved in phase 0: this stack's grant desk can fund grants (`init-secrets.py`).
- **One signer per payer.** This stack and ChatLPT share the payer account, so ChatLPT stays down during runs.
- **Runner availability.** The dry run records which listed orchestrators serve Qwen and FLUX; the final run needs at least one of each.
- **Next.js 16.** Server actions and streaming route handlers are checked against `web/node_modules/next/dist/docs/` before use.

## Decision log

- 2026-10-21 D15–D20 accepted by Mike: the console becomes the M3 reference app with Operator actions and a Builder area; key sign-in held server-side; fill in → review → result; the REST call shown on every action; one generic job form with chat and image presets; output views by content type.
- 2026-10-21 Operator actions are a page of their own, not buttons on the Money and Users pages: it keeps D1 checkable (no read-only page imports a write path) and puts the operator's whole job in one place.
- 2026-10-21 An Operator dialog refreshes the page when it closes, not when the write lands: a write that changes a row's buttons (Provision becomes Fund) would otherwise unmount the dialog showing its result. Found when a provision appeared to fail; the repeat that followed created a second allocation for `m3-builder` in the local Batteries, which is the double apply ISS-11 is about (evidence for John).
- 2026-10-21 Rates are shown exactly as advertised, wei as ETH with the wei beside it and the unit in words; no USD rate exists before a run (gap G14). The engine has no "who am I" call, so the Builder names its actor from the key's newest job (gap G13).
- 2026-10-21 The image runner returned byte-identical results for the identical prompt three times (fixed seed) and charged each run; the M3 journey document records it.
- 2026-10-21 Mike: the console's stack is the M3 dev stack (ISS-13), not a separate builder-core dev stack.
- 2026-10-21 From the M3 decision record: jobs are chat and image (no M4 work in M3); John owns the engine tasks; the events feed is held; the environment is the dev stack; the console shows wholesale cost only; the funded run is capped at $1 and run by the agent with Mike watching.
