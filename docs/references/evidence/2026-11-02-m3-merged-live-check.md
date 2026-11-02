# 2 November 2026: the console on the merged M3 engine (builder-core `1514212`)

**What ran.** The console stack from this branch, with the engine at builder-core `1514212`: `releases/m3`
after PRs #78, #81, #82, #83 and #77 merged (D58–D62), with #90's attempt timings. Images were built from
the pinned sources (`make images`); Clearinghouse Batteries `ca09e47` and the livepeer/node signer
`406b248`, paying on Arbitrum One. `ENGINE_PORT` was 8092 because a host process holds 127.0.0.1:8090. On
start the engine upgraded the existing `engine-data` volume from migration `0010` to `0011` (the attempt
timings) with no reset, and `/readyz` reported `0.0.1.dev1+g15142129e`.

## The committed scripts: all passing

| Script | Result | What it adds since 29 October |
| --- | --- | --- |
| [`scripts/live-check-d57.py`](../../../scripts/live-check-d57.py), through the engine | 46 of 46 | `before` paging and its 422 (D59), the 16 MiB request limit (D59), the 501 result route (D59), `by_app` adding up to `by_class` per class (D60), the held events feed (D60), a repeated revoke answering as the first (D61), reconciliation balanced |
| [`scripts/live-check-d57-ui.py`](../../../scripts/live-check-d57-ui.py), the Operator page in headless Chrome | 22 of 22 | a paused allocation refuses a run before anything ran, named as a payment refusal with what to do (D58); repeated revokes of a key and an allocation through the UI read as done (D61) |

## The wider M3 checks

Run from outside this repository, against the same stack: builder-core's `scripts/live_probe.py` at
`1514212`, 26 of 26 (ISS-23); a seven-outcome journey through the REST API, 17 of 17; engine runs for
payment reasons, access, secrets, a discovery outage, streams, Batteries down and sync replay, 41 of 42;
and the Builder and Operator journey in a browser, 33 of 33.

- The one engine miss is the harness's timing: its first engine restart landed after the stream had
  ended (the job is `succeeded`, as it should be). Its retry restarts mid-stream and passes: `uncertain`,
  `interrupted` after 582 events, and that job's cost still settles.
- Through the console in that browser run: the Operator funds a grant and rotates an actor's payment key
  (each with **Copy as curl** leaving the admin key out), and a paid FLUX schnell image renders inline
  (`sync_mode: true`).
- The Builder catalog now names each rate's source ("advertised by the orchestrator", D62). That was the
  one console miss on 30 October.
- The first browser run read My jobs before its list had streamed in; with the check waiting for the
  list, the rerun passed every check.

Network spend for the run, from the engine's cost summary after sync: about 0.011 USD over 17 jobs, all
observed, none pending.
