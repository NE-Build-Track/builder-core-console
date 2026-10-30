# Every REST operation in the M3 journey, and where the console exercises it (ISS-20)

ISS-20 ([Network-Engineering-SPE#33](https://github.com/Cloud-SPE/Network-Engineering-SPE/issues/33)) is
done when every REST operation in the journey (credential and admin operations, discovery, rates,
submission, status, results, usage and cost) is documented and exercised through the console. This page
lists each one, the console page or action that sends it, and how it was exercised. The engine's own
contract for each is in builder-core's `docs/contracts/` and its REST walkthrough,
[`docs/guides/rest-builder.md`](https://github.com/NE-Build-Track/livepeer-builder-core/blob/9e447ce8da4b78c4d155b470da1228d1c766f180/docs/guides/rest-builder.md).
Every call the console makes is also in [data-sources.md](data-sources.md), and every write shows its
request and response in the console, with **Copy as curl** (D18).

Pinned engine: builder-core `9e447ce` ([payment-stack.md](payment-stack.md)), the top of open PRs
#78–#83 (D58–D61). **Pending the live run** marks what has not yet been shown on a stack at this pin or
earlier through the console; `scripts/live-check-d57.py` (engine) and `scripts/live-check-d57-ui.py`
(console, in a browser) carry the checks for it.

## Evidence

| Ref | Run |
| --- | --- |
| E1 | 21 October, phase 3 and the re-pin to `ad6bba9`: paid chat and image jobs through the Builder, the job record, My jobs and Usage ([console-m3.md progress](../exec-plans/active/console-m3.md#progress)) |
| E2 | 23 October, re-pin to `165e601`: sign-in calls, an operator key issued (201) and revoked (204), the revoked key refused (401), every page 200 ([console-m3.md progress](../exec-plans/active/console-m3.md#progress)) |
| E3 | 26 October, `d057935`: key inspection and **Rotate** in a headless browser, 15 of 15 ([console-m3.md progress](../exec-plans/active/console-m3.md#progress)) |
| E4 | 29 October, `a6ed9b5`: 37 engine checks and 14 Operator checks in a browser ([evidence](evidence/2026-10-29-d57-live-check.md)) |
| L | The next live run at `9e447ce`: the D58–D61 checks added to both scripts on 30 October (pending) |

## Credential and admin operations (Operator actions, admin key)

| Operation | Console page or action | Exercised |
| --- | --- | --- |
| `GET /v1/admin/keys` | Operator sign-in check; Access keys table | E2, E4 |
| `GET /v1/admin/actors` | Operator: Actors and allocations | E4 |
| `GET /v1/admin/grants` | Operator: Grants; the review of every grant draw | E4 |
| `POST /v1/admin/grants` (`operation_ref`) | **Create a grant** | E4 (U2, U3) |
| `POST /v1/admin/grant/fund` (`operation_ref`) | **Fund** on a grant | Engine only (E4, A9); through the console **pending the live run** |
| `POST /v1/admin/applications/{application_id}/actors/{actor_id}/allocation` (`operation_ref`) | **Provision an actor** | E1 (first provision), E4 (U5: `already_provisioned`) |
| `POST …/allocation/fund` (`operation_ref`) | **Fund** on an actor | E4 (U4) |
| `POST …/allocation/status` | **Status** on an actor | L (U8: paused, then active) |
| `POST …/allocation/rotate-key` (`operation_ref`) | **Rotate payment key** on an actor | Engine only (E4, A8); through the console **pending the live run** |
| `POST …/allocation/revoke` | **Revoke** on an actor; a repeat is 200 with the revoked actor (D61) | L (U10) |
| `POST /v1/admin/keys` (`operation_ref`) | **Issue a key**, shown once | E2, E4 (U7) |
| `GET /v1/admin/keys/{key_id}` | The review of Rotate and Revoke | E3 |
| `POST /v1/admin/keys/{key_id}/rotate` (`operation_ref`) | **Rotate** on a key | E3 |
| `POST /v1/admin/keys/{key_id}/revoke` | **Revoke** on a key; a repeat is 204 (D61) | E2; repeat L (U9) |
| `GET /v1/allowance?actor_id=` | Operator: each actor's allocation; the review of a fund | E4 |

## Builder operations (actor key)

| Area | Operation | Console page or action | Exercised |
| --- | --- | --- | --- |
| Credential | `GET /v1/jobs?limit=1`, beside `GET /v1/admin/keys` | Builder sign-in: is the key working, and is it an actor key (the admin read is 403) | E1, E2 |
| Discovery | `GET /v1/offerings` | Catalog and run: every offering with ready runners and freshness | E1, E4 (page 200) |
| Discovery | `GET /v1/runners?app=` | The Network page's runners, GPU and price (read with the console's own key, not the builder's) | E4 (page 200) |
| Rates | `GET /v1/offerings` (`rate_low`, `rate_high`, `observed_at`) | Catalog: rate, currency, unit in words, age, stale marked | E1 |
| Submission | `POST /v1/jobs?stream=true` | **Run (paid)**, Chat example, streamed | E1 |
| Submission | `POST /v1/jobs?stream=false` | **Run (paid)**, Image example; since 30 October with `sync_mode: true`, the image inline | E1 (provider URL); inline image **pending the live run** |
| Submission, refused | `POST /v1/jobs` → 402, 403 or 503 with the job (`Failure.reason`, D58) | The run's result names the refusal and what to do | Unit tests; L (U8: `not_authorized` on a paused allocation) |
| Submission, refused | `POST /v1/jobs` → 413 `request_too_large` (D59) | The run's result names the limit | Unit tests; engine L (L1). Through the console it needs a 16 MiB input in the form: **not planned** |
| Submission, repeat | `POST /v1/jobs` → 409 `operation_*` (D57) | The run's result | Engine E4 (J1, J3, J4) |
| Status | `GET /v1/jobs/{job_id}` | The job record, polled until it settles; My jobs, one opened | E1 |
| History | `GET /v1/jobs?limit=50` | My jobs, with each failure's title and next step | E1 |
| Results | the `POST /v1/jobs` response itself | Output views: Rendered, JSON with images, Image, Raw; the record's `ResultRef` | E1 |
| Results | `GET /v1/jobs/{job_id}/result` | Not called: it answers 501 until M4 (results are inline once, D59) | Engine L (R1) |
| Usage and cost | `GET /v1/jobs/{job_id}/cost` | The job record's network cost, pending to final class | E1 |
| Usage and cost | `GET /v1/costs/summary` (`by_class`, `by_app`, D60) | Usage and cost: by class, and per app and class | E1 (by class); per app L |
| Usage and cost | `GET /v1/allowance` | Usage and cost: granted, spent, available; the no-allocation notice | E1 |

## Not in the console

- `GET /v1/jobs?before=` (D59): My jobs shows the 50 newest and does not page yet; the engine script
  checks paging (P1).
- `GET /v1/events`: held for M3 (D60), 501 `milestone: "held"`; the engine script checks it (E1 there).
- Cost sync and reconciliation (`POST /v1/admin/costs/sync`, `GET /v1/admin/reconciliation`) are the
  operator's, not the builder journey's: the Health and Users pages read reconciliation.
