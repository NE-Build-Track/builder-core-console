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

- [x] The stack and console pin builder-core `93756ba` (the PR #28 review fixes), then the merge commit on `releases/m3` (`ad6bba9`, 21 October); the engine spec in `openapi/` is regenerated at that pin. Now `9e447ce` (30 October), the top of open PRs #78–#83: **re-pin to their merge commit** before the final run.
- [x] Sign-in by pasting a key (D16): admin or actor, checked against the engine, held in a sealed httpOnly `SameSite=Strict` cookie the browser cannot read; sign-out; an expired or revoked key ends the session with a clear message. The read-only pages keep working without sign-in (D7). (ISS-21)
- [x] Write plumbing: an `EngineWriter` port and adapter, the only code that sends non-GET requests; every write returns an exchange (method, path, body, status, response, keys redacted) for the request panel with copy as `curl` (D18). The structural tests change from "never writes" to "writes only through the writer, only from the Operator and Builder areas". (ISS-20)
- [x] The fill in → review → result flow (D17) as one reusable form pattern: review shows before → after for money moves, typed key prefix for revocations, a new key shown once, a result toast and refreshed section; a generated operation reference on every admin call that accepts one. (ISS-20)
- [ ] Operator actions (ISS-20, ISS-08 and ISS-11 from the app side): create a grant; fund a grant; provision an actor with an allocation; fund an allocation; set allocation status; rotate an allocation's payment key; revoke an allocation; issue and revoke access keys **(all done)**; inspect and rotate access keys once the engine has them (ISS-08, waiting on John).
- [x] Builder catalog (ISS-21, ISS-10 display): offerings and runners from the engine with each rate's amount, currency, unit, source and age, stale or missing rates marked, "wholesale network rate" stated, no hand-kept entries.
- [x] Builder job form and output (ISS-22, D19, D20): offering, path, JSON input with chat and image presets, options; the job runs from the server and streams to the browser; Rendered (chat), JSON with images, `image/*`, and Raw views; failures show kind, message and whether payment went out.
- [x] Failures and refusals in builder-core's words (D58, D59): the job form's result, the job record, My jobs and the Jobs page show each failure's plain title from its `kind` and `reason`, what it means and what to do (engine.md#failures), beside the engine's message; 402, 403 and 503 from `POST /v1/jobs` read as the payment refusal they are; 413 `request_too_large` names the limit. Live: pending (U8 in `scripts/live-check-d57-ui.py`).
- [x] Results that last (D59, ISS-15 Q1): the FLUX schnell preset sends `sync_mode: true`, so the image comes back inline as a data URI; the JSON view shortens data URIs; an image at a provider URL that no longer loads says so, with the job and its cost standing. Live: pending.
- [x] Cost per app (D60): Usage and cost shows `by_app` per app and class, final classes and pending in their own columns, with `by_class` as the totals row and any class that does not add up named. Live: pending.
- [x] ISS-20: every REST operation in the journey listed with the console action that sends it and its evidence ([m3-rest-operations.md](../../references/m3-rest-operations.md)). Grant funding and payment-key rotation through the console, the inline image and `by_app` are pending the live run.
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
- [x] 2026-10-24 Re-pinned to `629f1ab`, the merge of builder-core PRs #43 and #44: a paid job never reads as `none`, per-job evidence versions, payment evidence stored before the paid request (migration `0005`; the engine migrates on start). The REST spec is unchanged.
- [x] 2026-10-26 Pinned to `d057935`, builder-core PR #48 (ISS-08, D44), to add **Rotate key** and key inspection to the Operator page. The spec only adds `GET /v1/admin/keys/{key_id}` and `POST /v1/admin/keys/{key_id}/rotate`. A missing permission now answers 403 instead of 404 on a job or its cost. Re-pin to the merge.
- [x] 2026-10-26 Operator: **Rotate** on each active key row. The review and the result:
  - **Before it is sent:** the review of Rotate and of Revoke now *inspects* the one key
    (`GET /v1/admin/keys/{key_id}`): its owner, created time, permissions and label (before → after), and a
    warning when it is already revoked or is an admin key.
  - **After:** the new key is shown once, naming the key it replaced; the request and response panel hides
    the token.
  - **Live on `d057935`:**
    - console API test 33/33;
    - an engine probe 22/22 (inspect, rotate, the old token 401 at once, 403/404 on job, cost and result,
      admin lists every actor, the `keys.*` audit lines, no token in the engine log);
    - the Rotate flow in a headless browser 15/15.
- [x] 2026-10-28 Display for builder-core `releases/m3` (D52, D54):
  - **Unknown payments:** an attempt whose signer never answered (`payment_unknown`, or a manifest still `unknown`) reads as "payment unknown", not "not paid", and the Builder keeps waiting for its cost.
  - **Wording:** a failed job's note follows its state, so "never retried" is gone.
  - **Sessions:** each shows its payment state, and a refused (`unpaid`) one is never shown as waiting for usage.
  - **Cost classes:** a job that failed over shows every cost class its attempts fell into, and `billable` sits beside the fees when they differ. The Usage page's cost-class notes are current.
  - **Gaps:** G2 is closed (both pages read `GET /v1/admin/actors`). G1 and G8 are now this repository's: the Jobs page does not use builder-core's job list yet, and the keys-mode reader still holds an admin key.
- [x] 2026-10-29 Pinned to builder-core `bebc2f6` (PR #76, `tasks/mz/iss-11-14-idempotency`, ISS-11 and ISS-14, D57) on branch `tasks/mz/iss-11-operation-refs`: admin commands now **require** an operation reference and are repeat-safe. Re-pin to #76's merge.
- [x] 2026-10-29 Re-pinned to builder-core `f58a2b1` (PR #76): provisioning an actor already provisioned under a new reference is 409 `already_provisioned` (nothing applied, the amount included), worded as such with a new reference offered; an admin command still running sends `Retry-After` as the seconds until it can be resumed. The engine OpenAPI is unchanged.
- [x] 2026-10-29 Re-pinned to builder-core `a6ed9b5`, the squash merge of PR #76 on `releases/m3` (its tree is `a41beef`'s; the engine OpenAPI is unchanged since `f58a2b1`).
- [x] 2026-10-29 Live check of builder-core D57 on the stack: 37 engine checks and 14 Operator checks in a browser, all passing ([evidence](../../references/evidence/2026-10-29-d57-live-check.md); `scripts/live-check-d57.py`, `scripts/live-check-d57-ui.py`).
  - **References:** create grant, provision, issue key and rotate key now send the dialog's reference, like fund grant, fund allocation and rotate payment key already did; all seven are `reference` and the ISS-11 review warning is gone. The rotate-key body is now always sent (it carries the reference).
  - **Answers:** the writer reads `Idempotent-Replayed`, and every engine problem keeps its `code` and `Retry-After`. A replay says nothing was applied twice; `operation_in_progress` says retry in N s (Try again, same reference); `operation_conflict` says the reference belongs to another request and offers Start over (new reference). Job 409s (`operation_exists`, in progress, conflict) read the same way in the Builder.
  - **Keys:** a replayed issue or rotation (`token: null`) names the key, says its token cannot be shown again, and offers **Rotate this key**, where before the result silently had no key.
  - **Docs and checks:** `deploy/README.md` and `scripts/demo-traffic.py` send references; `docs.test.ts` fails on a documented call without one, and `pins.test.ts` on a spec that does not require them. The spec and types are regenerated; migrations `0009` and `0010` are additive, so no volume reset. `services/operator-actors.ts` is split from `services/operator.ts` (400-line limit). `make check` and `make build` pass; not yet shown on the stack or in a browser.
- [x] 2026-10-30 Re-pinned to builder-core `9e447ce` (branch `tasks/mz/iss-23-verification`), the top of a stack of **open** PRs: #78 (ISS-12, D58) → #81 (ISS-15, D59) → #82 (ISS-18, D60) → #83 (ISS-23, D61). Re-pin to the merge commit once they merge. The spec adds `Failure.reason`, `CostSummary.by_app` and `before` on `GET /v1/jobs`; the types are regenerated and nothing broke. No migration since `a6ed9b5`, so volumes carry over. Built test-first, not yet shown on the stack:
  - **Failures (D58):** `domain/failures.ts` holds builder-core's failure table (title, meaning, what to do) by `kind` and payment `reason`; the job form's result, the job record, My jobs and the read-only Jobs page use it, with the engine's message and code beside it. A refused run (402, 403, 503 with the job) reads as that refusal; a 403 with no job is the access policy; the run route passes `Retry-After` on.
  - **Inputs and results (D59):** 413 `request_too_large` names the limit. The Image preset sends `sync_mode: true`; data URIs are shortened in the JSON view; a provider image that fails to load says the provider no longer serves it.
  - **Cost per app (D60):** the Usage and cost tab's per-app table (see the decision log).
  - **Revokes (D61):** nothing in the console depended on the old 404 and 400: a repeated or retried revoke reads as done (tests pin it), and the review of a key already revoked says the engine will change nothing.
  - **Docs and checks:** ISS-20 ([m3-rest-operations.md](../../references/m3-rest-operations.md)), the ISS-13 write-up and ISS-24 guide refreshed (the guide links builder-core's `docs/guides/rest-builder.md`); `scripts/live-check-d57.py` gains free checks for paging, the request limit, `by_app`, the held events feed, `/result` 501 and a repeated key revoke; `scripts/live-check-d57-ui.py` gains a payment refusal in the Builder on a paused allocation (D58) and both revokes through the console with their repeats (D61). Neither was run.
- [x] 2026-10-30 Fixes from the live suite of 30 October (A–L), built test-first, not yet shown on the stack:
  - **A revoked key ends the session (ISS-21, live run J):** before an Operator or Builder page renders, `src/proxy.ts` asks the engine once with a pasted-key session's key (`adminActors(1)` or `myJobs(1)`, as sign-in does). A 401 clears the area's cookie and the page shows the sign-in form with "The engine no longer accepts this key: it was revoked or it expired."; a 403, a 5xx or no answer leaves the session. The catalog, which reads public offerings, is covered too. A Builder run answered 401 ends the session the same way. The decision is `standing` in `services/signin.ts` (tests for 401, 403, 5xx, unreachable and expiry). Identity-provider sessions are unchanged.
  - **Gaps:** G12 closed (the create-grant response carries name, status and total; live A5). G1 says the engine now pages `GET /v1/jobs` with `before` (D59, #81) while the Jobs page still lists projections; G4 has one wording in both places; G8 cites `writes.test.ts`; G14 says #77 (D62) adds `price_usd` but the live orchestrators send none. `docs.test.ts` now compares each gap's owner, impact and fix in both copies, keeps closed gaps out of `GAPS`, and checks the test files a gap cites (it failed on G4 and G8 first).
  - **Docs:** the FLUX schnell image is at `output.images[0].url` in `m3-journey.md` (ISS-19), with the pinned versions (`pins.test.ts` now checks that table); `ENGINE_PORT` in `m3-environment.md` and `deploy/README.md`; recreating the signer after a clearinghouse restart (`make restart-payments`).
- [x] 2026-10-28 Re-pinned to `d3df806`, the merge of builder-core PR #69 on `releases/m3`. The spec is identical to `a2e61e4`, so the types are unchanged, and #7 leaves draft.
- [x] 2026-10-28 Pinned to builder-core `a2e61e4`, the head of PR #69 (#53 rebuilt on `releases/m3` `2134e29`), on #7's branch after merging `main`. Both stacks now build the signer from `livepeer/node` and Batteries from `livepeer/clearinghouse-batteries` (the same commits). `pins.test.ts` checks both compose files and refuses NE-Build-Track forks, and CI and `make compose-config` check the Keycloak stack too. The spec adds `payment_state`, `billable`, `payment_unknown` and the native HTTP fields, and the types are regenerated. `GET /v1/admin/grants` is refused to the auditor (#69), so the reader no longer asks with that token (`not_permitted`, shown as a note). Volumes from `0dbfe6e` are reset (`down -v`), because #69 renumbers the actor migrations. Re-pin to #69's merge.
- [x] 2026-10-26 Pinned to builder-core `985f23d` (`tasks/mz/discovery-service`, #45): a discovery service in the stack (`lpb discovery`, static list `deploy/config/orchestrators.txt`); the engine and the Network page read its `GET /discovery` (`CONSOLE_DISCOVERY_URL`); the signer has no orchestrator list or pinned certificates. Re-pin to the merge on `releases/m3`.
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
- **Operation references.** Generated when the form renders and kept through review and retry. Since builder-core `bebc2f6`, now `a6ed9b5` (D57) the engine requires one on the seven commands that move money or create a key (create grant, fund grant, provision, fund allocation, rotate payment key, issue key, rotate key) and answers a repeat from its record; set status and the two revokes take none, because a repeat ends in the same state (and, since D61, answers as the first did: 200 and 204, not 404 and 400).

### Depends on John (engine)

| Need | Task | Without it |
| --- | --- | --- |
| Access-key inspect and rotate | ISS-08 | Operator actions offer revoke and issue instead |
| ~~Operation references on every admin write~~ | ISS-11 | Done in builder-core `a6ed9b5` (PR #76, D57); the console sends them (29 October) |
| Capability input descriptions | builder-core #18 | Chat and image presets; other offerings start from `{}` |
| Rate source and age on offerings | ISS-10 | The console shows what the engine gives and marks the rest unknown |
| PR #28 merged into `releases/m3` | streaming | The final run cannot use streamed chat |
| PRs #78, #81, #82, #83 merged into `releases/m3` | ISS-12, 15, 18, 23 (D58–D61) | The console pins `9e447ce`, their unmerged top; the final run needs the merge commit |

### Risks

- ~~**Grant funding.**~~ Resolved in phase 0: this stack's grant desk can fund grants (`init-secrets.py`).
- **One signer per payer.** This stack and ChatLPT share the payer account, so ChatLPT stays down during runs.
- **Runner availability.** The dry run records which listed orchestrators serve Qwen and FLUX; the final run needs at least one of each.
- **Next.js 16.** Server actions and streaming route handlers are checked against `web/node_modules/next/dist/docs/` before use.

## Decision log

- 2026-10-30 ISS-21, how a revoked key ends a session: the check runs in `src/proxy.ts`, because a page cannot clear a cookie while it renders (Next.js 16 allows it only in the proxy, a route handler or a server action). It costs one small engine call per Operator or Builder page request, sharing a call already in flight for the same key but remembering no answer, so a revocation shows on the next page; it gives up after 3 seconds, so a hung engine delays the page by at most that. It skips the job run and the job poll, which are not pages; the run ends the session itself on a 401. Only a 401 ends it (a 403 is a missing permission; a 5xx or timeout says nothing about the key). The reason travels in a 5-minute `bc_<area>_ended` cookie (httpOnly, `SameSite=Strict`, cleared on sign-in and sign-out) holding only `refused` or `expired`, so the message survives a prefetch that clears the session before the page is shown. Identity-provider sessions keep their own refresh and expiry.

- 2026-10-30 builder-core D58–D61, built from the contracts: the failure words are builder-core's table (`engine.md#failures`), not the console's, so where the table says "the same `operation_ref` runs again" the console says so, though its Run makes a new reference each time. The cost per app is a table with one column per class, the final classes first and `pending` last, never summed (D60), with the summary's `by_class` as the totals row; apps are ordered by their final spend, then pending. The Builder's Usage and cost tab shows it (the builder's own jobs); the read-only Usage page keeps its Batteries "By app" bars. The FLUX schnell preset sends `sync_mode: true` (Mike, ISS-15 Q1).

- 2026-10-29 builder-core D57: admin commands require `operation_ref`. The console keeps one reference per dialog until a new intent (Do another, or Start over after `operation_conflict`), so a double submit, a closed and reopened dialog, or a retry after a lost answer is the same command. It branches on the problem's `code`, never its text. A replayed key command has no token, so the result offers a rotation rather than pretending a key was shown.

- 2026-10-21 D15–D20 accepted by Mike: the console becomes the M3 reference app with Operator actions and a Builder area; key sign-in held server-side; fill in → review → result; the REST call shown on every action; one generic job form with chat and image presets; output views by content type.
- 2026-10-21 Operator actions are a page of their own, not buttons on the Money and Users pages: it keeps D1 checkable (no read-only page imports a write path) and puts the operator's whole job in one place.
- 2026-10-21 An Operator dialog refreshes the page when it closes, not when the write lands: a write that changes a row's buttons (Provision becomes Fund) would otherwise unmount the dialog showing its result. Found when a provision appeared to fail; the repeat that followed created a second allocation for `m3-builder` in the local Batteries, which is the double apply ISS-11 is about (evidence for John).
- 2026-10-21 Rates are shown exactly as advertised, wei as ETH with the wei beside it and the unit in words; no USD rate exists before a run (gap G14). The engine has no "who am I" call, so the Builder names its actor from the key's newest job (gap G13).
- 2026-10-21 The image runner returned byte-identical results for the identical prompt three times (fixed seed) and charged each run; the M3 journey document records it.
- 2026-10-21 Mike: the console's stack is the M3 dev stack (ISS-13), not a separate builder-core dev stack.
- 2026-10-21 From the M3 decision record: jobs are chat and image (no M4 work in M3); John owns the engine tasks; the events feed is held; the environment is the dev stack; the console shows wholesale cost only; the funded run is capped at $1 and run by the agent with Mike watching.
