# Harness engineering

This repository follows OpenAI's "Harness engineering: leveraging Codex in an agent-first world"
(Ryan Lopopolo, 11 February 2026, <https://openai.com/index/harness-engineering/>), as builder-core
and ChatLPT already do:

- **Humans steer, agents execute.** The engineer's job is the environment: maps, invariants, feedback loops.
- **AGENTS.md is a table of contents**, not a manual. Deep knowledge lives in `docs/` and is cross-linked.
- **The repository is the system of record.** What is not in it does not exist to an agent.
- **Enforce invariants mechanically**: layering, confinement, read-only, taste, pins and doc sync,
  with the fix in the failure message (`web/tests/structure/`).
- **Plans are artifacts** with progress and decision logs. Tech debt is tracked and paid continuously.
- **Make the app legible to agents**: `make dev` per worktree, `/livez`, every failed read named by
  source on the page, and the stack's own health as the home page.

Local adaptations: structural tests run in Vitest beside the unit tests (one runner); no beads; a
CI workflow runs `make check` but nothing deploys from this repository yet.
