# Tech-debt tracker and future work

Known shortcuts, and the work that v1 deliberately left out. Each entry names its exit condition.
Upstream gaps live in [gaps.md](../references/gaps.md); this page is for this repository.

| # | Item | Why it exists | Exit condition |
| --- | --- | --- | --- |
| T1 | **Prometheus (and Grafana) for history.** Scrape the signer's `/metrics` now and the engine's once it has one (gap G4); chart rates and backlogs over time. | v1 computes on demand from current state (D6); the signer's counters reset on restart and nothing keeps history. | A `prometheus` service in compose scraping the relay and the engine, and console charts reading PromQL; or a decision not to. |
| T2 | **Local rollups of usage.** Store daily totals per app, orchestrator and allocation instead of walking the whole Batteries feed. | The usage feed has no time filter (gap G6); cost grows with history. | Batteries gains a time filter (preferred), or a small rollup store with replay from the feed. |
| T3 | **Sign-in.** | v1 is loopback-only with no auth (D7). | Before the console listens on anything but 127.0.0.1. |
| T4 | **Browser and accessibility evidence.** | v1 was verified by rendering pages over HTTP, not in a browser. | A Playwright smoke that drives each page in both themes and at 360 px, kept in `web/e2e/`. |
| T5 | **The engine boundary is typed, not parsed.** | Engine bodies are trusted to match the pinned spec (D12). | Generate zod from the spec, or keep the image and spec pinned together (`pins.test.ts`). |
| T6 | **Orchestrator TLS pins are trust-on-first-use** (copied from ChatLPT). | Public orchestrators serve self-signed certificates and the signer has no skip-verify (ChatLPT T3). | The orchestrators serve CA-signed certificates. |
| T7 | **Escrow needs the on-chain listener.** | Gap G7. | Enable `--enable-onchain-listener` with the payer address in `clearinghouse.toml`, after checking the RPC's history limits. |
| T8 | ~~**Visual design.**~~ **Done 20 October:** the mock is the design (D14). | — | Closed. |
| T9 | **Signer history resets per page view.** Sparklines show samples since the page opened. | No history is stored (D6). | Prometheus (T1). |
