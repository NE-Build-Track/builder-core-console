# Quality score

Grades as of 20 October 2026. A: proven and enforced. B: works and tested. C: works, thinly verified.

| Area | Grade | Evidence | Next step |
| --- | --- | --- | --- |
| Read-only guarantee | A | `read-only.test.ts`; Batteries reader credential is `*.read` | Read-only engine credential (G8) |
| Layering and boundaries | A | `layers.test.ts` | — |
| Services (page logic) | B | Unit tests on live-shaped fixtures for every service | Property tests for decimal sums |
| Adapters | B | Tests with stubbed fetch: paging, caps, shape errors, 503 bodies | Contract test against a live stack in CI |
| Deploy | B | Images built; `first-run.sh` run; engine + Batteries + console up | Run with the signer (needs ChatLPT stopped) |
| Pages | B | Rendered against the full live stack (signer included); headless Chromium in both themes at 1280 and 390 px with no errors or overflow; palette, theme, window switch, chart focus, gap links and the skip link driven by keyboard | Screen-reader pass; a committed Playwright smoke (T4) |
| Docs | A | `docs.test.ts`: gaps, routes, links, indexes, plan shape | — |
| Visual design | A | The accepted mock (D14), ported layer for layer; guarded against Tailwind name clashes | Page transitions in Safari and Firefox |
