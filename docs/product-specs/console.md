# Builder console

**Who it is for:** the operator of a builder stack: whoever funds grants, provisions actors and keeps
the engine, Batteries and the signer running. **What it answers:** is the stack healthy, what can it
buy, where did the money go, who used it, and what happened to a given job. It changes nothing (D1)
and needs no sign-in on 127.0.0.1 (D7).

Every section names its source and read time; every failed read names the source and the problem;
every known limit cites its gap ([gaps.md](../references/gaps.md)).

## Health

The home page. An overall verdict (Operational, Impaired, Partly unknown) with the sentence that
explains it and a live diagram of the stack: engine, signer, Batteries and the orchestrators being
paid, with packets moving only along healthy paths. Then one card per component with the checks
behind it; overall is the worst component. Then the signer's metrics (sparklines since the page
opened) and a ticker of the newest signed tickets.

| Component | Check | Healthy when |
| --- | --- | --- |
| Engine | Ready | `/readyz` says ready |
| Engine | Discovery | `discovery_fresh`; otherwise the engine's own error |
| Engine | Cost sync | synced in the last 150 s with no error; never synced reads Unknown |
| Engine | Version | the reported version contains the pinned short commit |
| Engine | Running jobs | informational |
| Batteries | Ready | `/readyz` 200 |
| Batteries | Engine agrees with Batteries | every allocation balanced: the application in per_application mode, each actor in per_actor mode (gap G10); no allocation yet reads Unknown |
| Signer | Ready to pay | signer `/readyz` 200; a 503 shows the signer's reason |
| Signer | Accounting outbox | healthy and empty; a backlog older than 300 s is Down |
| Signer | Delivery errors | no publish, enqueue or storage errors since start |

## Network

Tiles for apps, orchestrators (fresh and stale), runners and free slots. Offering cards for the nine
apps with the most capacity (runners, orchestrators, free slots, price range) and every app in a
table below. Orchestrator cards with a gauge of free slots, last seen and their apps. Every runner
(GPU and VRAM, slots, price, version) in a table that collapses past 25 rows.

## Money

Tiles for granted, allocated, spent and available. Each grant as a card with two gauges (share spent,
share allocated), its allocations as a tree with the days of balance left at the last 7 days' pace,
and the gateway keys of each allocation (copyable prefixes), from Batteries. Allocations whose grant is missing are shown apart.
Beside it: the engine's grant list (a cross-check), Batteries' ledger balances, and payer escrow
(empty without the on-chain listener, gap G7).

## Users

Actors from the engine's key list (gap G2): application, active and revoked keys, allocation and
status, available balance, 30-day spend across cost classes, and reconciliation. Money columns read
only for `CONSOLE_APPLICATION_ID` (gap G9). Then the whole application's reconciliation and the admin
keys.

## Usage

A window switch (24 h, 7 d, 30 d) and a ticker. Tiles for fees paid, tickets applied (with the average
fee), quarantined events and jobs with a cost. An area chart of fees per hour or day (pointer and
arrow keys; the exact numbers in a table under it). The engine's cost classes as a stacked bar with a
legend. Fees by app, orchestrator and allocation as ranked bars. The newest tickets and any
quarantined events as tables.
Totals are marked partial when a list hit the row cap (gap G6).

## Jobs

A job id lookup (a GET form inside `<search>`). A found job shows its app, actor, mode, times, failure,
measured usage and cost; each attempt with its orchestrator, outcome, payment, cost class and signed
sessions; and the Batteries usage events for those sessions' manifests. Below: the 25 newest costed
jobs (gaps G1, G3).

## Sources and gaps

Every upstream route the console reads, with its credential and purpose; the pinned commits; and every
known gap with its owner and fix.

## Out of scope for v1

Writes of any kind, sign-in, history beyond what the sources hold, alerts, and charts that need time
series the sources do not keep (Prometheus; see the tech-debt tracker).
