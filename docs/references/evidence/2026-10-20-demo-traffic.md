# 20 October 2026: multi-actor paid traffic through the stack

**What ran.** `scripts/demo-traffic.py` against the full stack (`make up`; ChatLPT's stack stopped, so one
signer per payer). Two grants were created with the Batteries CLI ("Acme Studio" $2, "Northwind Research" $1)
and five actors were provisioned through the engine, each with its own allocation and `lpk_` key:

| Actor | Application | Grant | Allocation |
| --- | --- | --- | --- |
| alice | default | Acme Studio | $0.40 |
| bob | default | Acme Studio | $0.25 |
| carol | default | Northwind Research | $0.30 |
| dave | default | Northwind Research | $0.05 |
| erin | studio | Acme Studio | $0.20 |

58 paid jobs ran on the live network: Qwen 3.8 27B chat (`blueclaw/chat/qwen3.8-27b`) and Nomic embeddings
(`blueclaw/embeddings/ollama`), on orchestrators xodeapp, speedybird and eliteencoder. One request was rejected
on purpose (malformed `messages`). The script ran three batches; the third was an accidental repeat of the
second (a re-run inside a check command), so 58 jobs ran instead of the intended 36.

**What the sources reported** (read through the engine's admin API and Batteries' reader credential):

- Batteries applied 56 signed-ticket events, none quarantined, $0.004533480972505736 in total.
- Engine cost classes for application `default`: delivered $0.003870044732609030 (50 rows), failed after payment
  $0.000110572706649451 (1 row: the rejected request was paid, then failed), uncertain 0, pending 0. 51 jobs with a
  cost, none pending.
- `default` ($0.003980617439258481) plus erin in `studio` ($0.000552863533247255) equals Batteries' total exactly.
- Reconciliation per actor: alice, bob, carol, dave, smoke-actor and erin all `balanced: true`.
- The Batteries ledger sums to zero across allocations, spent accounts, funding sources and unallocated balances.

**What the console showed.** Health: Operational, every check passing, packets flowing to five orchestrators.
Usage: fees by app (chat 87.8%, embeddings 12.2%), by orchestrator and by allocation; the cost-class bar with
one failed-after-payment sliver. Users: six actors (erin readable only for reconciliation, gap G9). Money: three
grants with gauges and runway estimates. Jobs: the 25 newest projections, all observed.

## Steady traffic: five minutes, five actors

`scripts/demo-traffic.py --yes --duration 300 --workers 3 --pause 1`, right after the batches above.

- **409 jobs, 0 failed**, rotating actors and apps with three in flight: alice 59, bob 118, carol 116, dave 58,
  erin 58; chat 292, embeddings 117.
- Batteries now holds **465 applied tickets, $0.040159553676459552** in total.
- Engine, application `default`: delivered $0.033064003261599440 (401 rows), failed after payment
  $0.000110572706649451 (1 row), 402 jobs with a cost, none pending. Plus erin in `studio`
  ($0.006984977708210661): equal to Batteries' total.
- **While traffic ran**, the engine reported four allocations as `balanced: false` with zero unattributed rows:
  Batteries was one or two tickets ahead of the 30-second cost sync. This became gap G11, and the console now
  shows it as "catching up" rather than a warning.
- **Within one cost sync after traffic stopped**, all five actors reconciled `balanced: true` with zero
  unattributed rows.
