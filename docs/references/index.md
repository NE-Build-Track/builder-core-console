# References

| Document | What it holds |
| --- | --- |
| [data-sources.md](data-sources.md) | Every route the console reads, with credential, shape and page |
| [engine-payment-reads.md](engine-payment-reads.md) | Draft engine API enhancement to replace direct remote Batteries reads (G16) |
| [gaps.md](gaps.md) | What the stack cannot show yet, the fix, and who owns it |
| [payment-stack.md](payment-stack.md) | Batteries and the signer: pins, topology, secrets |
| [m3-environment.md](m3-environment.md) | The M3 funded configuration: endpoints, credentials, funding, accounting (ISS-13) |
| [m3-rest-operations.md](m3-rest-operations.md) | Every REST operation in the M3 journey, the console action that sends it, and its evidence (ISS-20) |
| [harness-engineering.md](harness-engineering.md) | The working method this repository follows |

## Evidence

| Run | What it shows |
| --- | --- |
| [2026-10-20 demo traffic](evidence/2026-10-20-demo-traffic.md) | Five actors, two grants, 58 paid jobs; Batteries and the engine agree to the last digit |
| [2026-10-29 repeat-safe commands](evidence/2026-10-29-d57-live-check.md) | builder-core D57 (#76) live: 37 engine checks and 14 Operator checks in a browser, all passing |
| [2026-11-02 the merged M3 engine](evidence/2026-11-02-m3-merged-live-check.md) | The console on builder-core `1514212`: the committed scripts and the wider M3 checks; the ISS-25 dry run |
| [2026-11-09 the funded journey (ISS-25)](evidence/2026-11-09-iss-25-funded-journey.md) | The seven outcomes, paid on Arbitrum One: 28 checks; the Batteries row behind each cost; the payer before and after |
