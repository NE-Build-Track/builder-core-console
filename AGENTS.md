# AGENTS.md

This file is a **map**, not a manual. Read the linked documents when a task touches them.

## What this repository is

The **builder console**: a read-only operations view of one livepeer-builder stack. The stack is the
stock builder-core engine (`lpb serve`), Clearinghouse Batteries and the node remote signer, run as
Docker services exactly as ChatLPT runs its payment stack. The console reads their health, money,
users, usage and jobs, and changes nothing.

## Start here

| You need | Read |
| --- | --- |
| The layers, and what may import what | [ARCHITECTURE.md](ARCHITECTURE.md) |
| What each page shows and why | [docs/product-specs/console.md](docs/product-specs/console.md) |
| Where every number comes from | [docs/references/data-sources.md](docs/references/data-sources.md) |
| What the stack cannot tell us yet | [docs/references/gaps.md](docs/references/gaps.md) |
| Why something was decided | [docs/design-docs/decisions.md](docs/design-docs/decisions.md) |
| The rules every change follows | [docs/design-docs/core-beliefs.md](docs/design-docs/core-beliefs.md) |
| Running the stack: images, secrets, first run | [deploy/README.md](deploy/README.md), [docs/references/payment-stack.md](docs/references/payment-stack.md) |
| Frontend conventions (Next.js, shadcn, CSS, HTML) | [docs/FRONTEND.md](docs/FRONTEND.md), [docs/DESIGN.md](docs/DESIGN.md) |
| What to work on, and its acceptance | [docs/exec-plans/active/](docs/exec-plans/active/) and [docs/PLANS.md](docs/PLANS.md) |
| Known shortcuts and future work | [docs/exec-plans/tech-debt-tracker.md](docs/exec-plans/tech-debt-tracker.md) |
| Configuration and operations | [docs/RELIABILITY.md](docs/RELIABILITY.md) |
| Credentials and trust boundaries | [docs/SECURITY.md](docs/SECURITY.md) |
| How healthy each area is | [docs/QUALITY_SCORE.md](docs/QUALITY_SCORE.md) |
| Everything else | [docs/index.md](docs/index.md) |

## Commands

```sh
make install        # pnpm install in web/
make check          # typecheck, lint, tests (unit + structural), compose config
make dev            # next dev on a per-worktree port, against the URLs in web/.env.local
make build          # next build
make images         # build the stack's images from pinned sources (never pushes)
make up / make down # run / stop the whole stack (stop ChatLPT's stack first: one signer per payer)
make logs           # follow every service's logs
cd web && pnpm gen:api   # regenerate src/domain/engine-schema.d.ts after re-pinning the engine
```

## Source map

```text
web/src/
  utils/       exact decimals, time, bounded concurrency (imports nothing internal)
  domain/      types layer: zod schemas for Batteries and the signer, engine types, view models,
               pins, the gap registry and the route catalog
  ports/       providers: the read-only reader interfaces services depend on
  config/      CONSOLE_* settings (server-only)
  adapters/    engine (openapi-fetch), Batteries and signer (GET via http.ts) (server-only)
  services/    pure page logic over the ports: health, network, money, users, usage, jobs
  runtime/     wiring and the TTL cache; the only thing pages call (server-only)
  components/  ui/ = shadcn kit as generated; console/ = the console's own semantic pieces
  app/         Next.js routes: one server component per page, reads inside <Suspense>
web/tests/structure/   layers, read-only, taste, pins, docs: invariants with fix-it messages
deploy/                compose, configs, secrets bootstrap, the console image
openapi/               the pinned engine's OpenAPI spec
```

## Working agreements

- **Read-only pages, deliberate writes.** The existing pages make no writes (D1). Writes live only in the
  Operator actions and Builder areas (D15), behind a key sign-in (D16), as fill in → review → result
  (D17) with the REST call shown (D18). The structural tests enforce read-only today and change with
  the first write. Any other write is a new decision first.
- **Enforce invariants, not style.** If a rule matters, add it to `web/tests/structure/` with a
  failure message that says how to fix it.
- **Parse at the boundary.** Batteries and signer bodies go through zod in `domain/`; the engine is
  typed by its pinned spec. Nothing downstream sees an unparsed body.
- **Money is exact.** Decimal strings and `utils/decimal.ts`; never floats, never "missing = 0".
- **Name the source.** Every number on a page says where it came from; every failed read says which
  source and why; every known hole cites its gap id.
- **Docs move with code.** A new route goes in `domain/catalog.ts` and `data-sources.md`; a new gap
  in `domain/gaps.ts` and `gaps.md`; a re-pin in `domain/pins.ts`, `deploy/compose.yaml` and
  `payment-stack.md`. Tests fail until they agree.
- **Plans are artifacts.** Update the exec plan's progress and decision log in the same change.
- **Git:** never commit or push without a human review.

## Escalate to a human when

- a change would write to the engine or Batteries, or move money;
- an upstream repository (builder-core, Batteries, node) needs a change: record it as a gap first;
- a change would alter an accepted decision in [docs/design-docs/decisions.md](docs/design-docs/decisions.md).
