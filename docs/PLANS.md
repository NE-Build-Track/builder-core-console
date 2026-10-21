# Plans

Plans are versioned artifacts. Small changes use a short note in the change. Anything that spans
sessions gets an **execution plan** in `exec-plans/active/`, which an agent can resume from the
repository alone.

## Exec plan shape

`web/tests/structure/docs.test.ts` enforces these sections, in order:

1. `## Status`: owner, state
2. `## Goal`: one paragraph
3. `## Acceptance`: checklist
4. `## Progress`: dated checklist; update it in the same change as the work
5. `## Decision log`: dated decisions with their source

When every acceptance item is evidenced and Mike has reviewed it, move the plan to
`exec-plans/completed/`. Shortcuts and future work go in
[exec-plans/tech-debt-tracker.md](exec-plans/tech-debt-tracker.md).

## Plans

| Plan | State |
| --- | --- |
| [active/console-v1.md](exec-plans/active/console-v1.md) | Scaffolded; awaiting review |
| [active/console-m3.md](exec-plans/active/console-m3.md) | Planned 21 October; awaiting review |
