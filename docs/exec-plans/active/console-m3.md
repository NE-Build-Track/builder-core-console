# Console M3: the reference app for the complete builder journey

## Status

Owner: Mike (built by an agent under his review). State: **planned 21 October 2026; awaiting Mike's
review before any build.** M3 gate 20 November 2026 ([epic #20](https://github.com/Cloud-SPE/Network-Engineering-SPE/issues/20),
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

- [ ] The stack and console pin builder-core `93756ba` (the PR #28 review fixes), then the merge commit on `releases/m3` once it exists; the engine spec in `openapi/` is regenerated at that pin.
- [ ] Sign-in by pasting a key (D16): admin or actor, checked against the engine, held in a sealed httpOnly `SameSite=Strict` cookie the browser cannot read; sign-out; an expired or revoked key ends the session with a clear message. The read-only pages keep working without sign-in (D7). (ISS-21)
- [ ] Write plumbing: an `EngineWriter` port and adapter, the only code that sends non-GET requests; every write returns an exchange (method, path, body, status, response, keys redacted) for the request panel with copy as `curl` (D18). The structural tests change from "never writes" to "writes only through the writer, only from the Operator and Builder areas". (ISS-20)
- [ ] The fill in → review → result flow (D17) as one reusable form pattern: review shows before → after for money moves, typed key prefix for revocations, a new key shown once, a result toast and refreshed section; a generated operation reference on every admin call that accepts one. (ISS-20)
- [ ] Operator actions (ISS-20, ISS-08 and ISS-11 from the app side): create a grant; fund a grant; provision an actor with an allocation; fund an allocation; set allocation status; rotate an allocation's payment key; revoke an allocation; issue and revoke access keys; inspect and rotate access keys once the engine has them (ISS-08).
- [ ] Builder catalog (ISS-21, ISS-10 display): offerings and runners from the engine with each rate's amount, currency, unit, source and age, stale or missing rates marked, "wholesale network rate" stated, no hand-kept entries.
- [ ] Builder job form and output (ISS-22, D19, D20): offering, path, JSON input with chat and image presets, options; the job runs from the server and streams to the browser; Rendered (chat), JSON with images, `image/*`, and Raw views; failures show kind, message and whether payment went out.
- [ ] Builder job record (ISS-22): live state, attempts with orchestrator and payment, result reference, and network cost followed from `pending` to its final class.
- [ ] Builder history and usage (ISS-22, outcome 7): my jobs, my allowance, my cost summary by class, wholesale only.
- [ ] ISS-13 write-up: the console's stack in `deploy/` (the M3 dev stack: builder-core's engine, Batteries and the signer at pinned commits, plus the console) documented as the funded configuration: endpoints, scoped credentials, allocation setup, who funds the signer, accounting access, and the one-signer-per-payer rule.
- [ ] ISS-19 document: chat (Qwen, streamed) and image (FLUX schnell) with inputs, expected observations and pinned versions; the seven-outcome journey; the M4 matrix (async, persistent endpoints, MCP, embedded vs service, enterprise auth, the second payment configuration).
- [ ] ISS-24 guide: the README takes a reviewer from install to the full journey, linking builder-core's install docs and the embedded walkthrough, with no secrets.
- [ ] Checked in headless Chromium (light and dark, 1280 px and 390 px) and with the keyboard only; tests, lint, typecheck, build and compose config green.
- [ ] Dry run of the journey by 13 November, with the expected cost stated first.
- [ ] ISS-25 final run on merged code: evidence linking the builder key, live discovery and rate, both jobs, results, usage and final network-cost classes; operator funding shown; spend under $1 across all runs.
- [ ] Mike's review.

## Progress

- [x] 2026-10-21 Plan written from the M3 decisions (console D15–D20, decision record above); awaiting review.

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

- **Routes.** Operator actions live under `/operator/…` beside the pages they change (a grant's actions on its card); the Builder area under `/builder` (catalog, run, jobs, usage). Read-only pages keep their routes.
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

- **Grant funding.** On 20 October `POST /v1/admin/grants` with an amount failed with `provider HTTP 403` under ChatLPT's credentials (no `grants.fund`). Phase 0 checks whether this stack's Batteries operator credential can be given that scope; otherwise "create grant" and "fund grant" stay CLI steps and the operator area says so.
- **One signer per payer.** This stack and ChatLPT share the payer account, so ChatLPT stays down during runs.
- **Runner availability.** The dry run records which listed orchestrators serve Qwen and FLUX; the final run needs at least one of each.
- **Next.js 16.** Server actions and streaming route handlers are checked against `web/node_modules/next/dist/docs/` before use.

## Decision log

- 2026-10-21 D15–D20 accepted by Mike: the console becomes the M3 reference app with Operator actions and a Builder area; key sign-in held server-side; fill in → review → result; the REST call shown on every action; one generic job form with chat and image presets; output views by content type.
- 2026-10-21 Mike: the console's stack is the M3 dev stack (ISS-13), not a separate builder-core dev stack.
- 2026-10-21 From the M3 decision record: jobs are chat and image (no M4 work in M3); John owns the engine tasks; the events feed is held; the environment is the dev stack; the console shows wholesale cost only; the funded run is capped at $1 and run by the agent with Mike watching.
