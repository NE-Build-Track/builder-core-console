# Builder console

The builder console, and the Build Track's M3 reference app, for a
[livepeer-builder](https://github.com/NE-Build-Track/livepeer-builder-core) stack: the stock engine
(`lpb serve`), Clearinghouse Batteries and the node remote signer, run as Docker services.

- **Read-only pages** show the stack's health, the network it can buy from, grants and allocations,
  users, usage over time and jobs. They change nothing (D1).
- **Operator actions** (sign in with an admin key) fund grants, provision actors and issue their keys.
- **Builder** (sign in with an actor key) is the builder's journey over the engine's REST API: the live
  catalog and its rates, a paid job with its output streamed in, its result or failure, and what it cost.

Every write is reviewed before it is sent and shows its exact REST call and response (D15–D20).

> Status: **v1 pages accepted; M3 areas built, in review.** Bound to 127.0.0.1. See
> [docs/exec-plans/active/console-m3.md](docs/exec-plans/active/console-m3.md) and the
> [M3 journey guide](docs/guides/m3-journey.md).

## Pages

| Page | Shows | Reads |
| --- | --- | --- |
| Health | A verdict per component and the checks behind it | engine `/readyz`, reconciliation; Batteries `/readyz`; signer `/readyz`, `/metrics` |
| Network | Apps on offer, runners (GPU, capacity, price), orchestrators | engine offerings and runners; signer discovery |
| Money | Grants → allocations → gateway keys, ledger, escrow | Batteries management API; engine grants |
| Users | Actors, keys, allowance, 30-day spend, reconciliation | engine admin keys, allowance, costs, reconciliation |
| Usage | Fees by day, app, orchestrator, allocation; cost classes | Batteries usage and sessions; engine cost summary |
| Jobs | Newest costed jobs; any job by id with its Batteries events | engine projections, job, job cost; Batteries usage |
| Sources & gaps | Every route read, the pins, and what the stack cannot show yet | — |
| Operator | Grants, actors and keys, each with its actions: create and fund grants, provision and fund actors, set status, rotate the payment key, revoke; issue and revoke access keys | engine admin API with the signed-in admin key |
| Builder | Catalog with wholesale rates; one job form for any offering with streamed output; the job's attempts, result and network cost; my jobs; my allowance and cost | engine REST API with the signed-in actor key |

## Run the stack

```sh
make install
python3 deploy/init-secrets.py          # or copy ChatLPT's deploy/secrets first: it adds the reader only
cp deploy/.env.example deploy/.env
make images                              # clearinghouse, signer, engine, console from pinned sources
deploy/first-run.sh                      # fills tokens, LPB_SECRET_KEY and the engine admin key
make up                                  # stop ChatLPT's stack first: one signer per payer account
```

The console is at <http://127.0.0.1:3060>; the engine's Swagger UI, the stack's write path, at
<http://127.0.0.1:8090/docs>. Details: [deploy/README.md](deploy/README.md).

## Develop

```sh
make check   # typecheck, lint, unit + structural tests, compose config
make dev     # next dev on a per-worktree port; set CONSOLE_* in web/.env.local
```

Read [AGENTS.md](AGENTS.md) first. It maps the repository, its rules and its docs.

## License

MIT. See [LICENSE](LICENSE).
