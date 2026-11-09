# 9 November 2026: the funded seven-outcome journey (ISS-25)

The final run for ISS-25 ([Cloud-SPE/Network-Engineering-SPE#38](https://github.com/Cloud-SPE/Network-Engineering-SPE/issues/38)).
The journey is [m3-journey.md](../../product-specs/m3-journey.md). The run on 2 November
([evidence](2026-11-02-m3-merged-live-check.md)) was the dry run.

**What ran.** [`scripts/journey-m3.py`](../../../scripts/journey-m3.py), once, through the engine's REST API,
against the console stack built from its pins with `make images`. It started at 16:07:06 UTC and took 28
seconds.

| Component | Version |
| --- | --- |
| Console | `dc160aa` (`main`; the stack was built from this checkout, clean) |
| Engine | builder-core `15142129e`, the merged M3 code. `/readyz` reported `0.0.1.dev1+g15142129e` |
| Batteries | `livepeer/clearinghouse-batteries` `ca09e47` |
| Signer | `livepeer/node` `406b248` (v1.0.2) |
| Payer | `0x5ae4e42db3671370a0c25aff451e7482aaec3d0b`, on Livepeer's TicketBroker on Arbitrum One (`0xa8bB618B1520E284046F3dFc448851A1Ff26e41B`) |

```sh
make images && make up
python3 scripts/journey-m3.py --yes --out <dir>
```

Every check passed: 28 of 28. The script's record of the run,
[2026-11-09-iss-25-funded-journey.json](2026-11-09-iss-25-funded-journey.json), holds every id, response
and reading below, and the result of every check. It holds no keys: only key ids.

## The image job changed

ISS-19 picked `comfystream/fal-flux-schnell` as the image job. By 9 November it was gone: the orchestrator
`ai1.eliteencoder.net` has moved its runners to runner contract v1, and its 73 fal routes no longer appear in
discovery. Its replacement on the same orchestrator is the app `text-to-image`. That is FLUX.2-klein-4B,
answering with registry profile `openai.images.v1` (`POST /v1/images/generations`). It costs $0.02 an image,
against about $0.003 for FLUX schnell. The chat job, `blueclaw/chat/qwen3.8-27b`, is unchanged.

## The seven outcomes

| # | Outcome | What the run did | Evidence |
| --- | --- | --- | --- |
| 1 | Obtain one credential | The operator issued an actor key; the builder's first call with it was accepted | Key `key_QfazVSm05U5eMxXx`, actor `iss25-1794240426-builder` |
| 2 | Discover capabilities | Both apps offered, one runner each, ready, discovery fresh | `GET /v1/offerings` at 16:07:03 UTC |
| 3 | Understand the expected rate | Each rate with its currency, unit and source, read before running | Chat 5,176,698,850 wei a second; image 9,381,514,095,797 wei a request ($0.02 as advertised); both from the orchestrator |
| 4 | Invoke a capability | A streamed chat, then an image | Jobs `08d171de-3596-4a26-b879-aac6878dc62b` (chat) and `5f3c5414-bcf4-420f-bb5f-e5b1f0e3c6ab` (image) |
| 5 | Receive a result | 34 events ending `[DONE]`, 54 completion tokens; a 1024×768 PNG inline in `data[0].b64_json`. Both records `succeeded`, one paid attempt each | Result sha256 `369d3e4d…` (chat) and `d3f05f52…` (image) |
| 6 | Pay without holding crypto | The operator created a grant and allocated $0.05 of it; the builder held only its key. Both attempts were paid from that allocation | Grant `AaHBEDKCfJetW6CTjW6emA` ($0.10), allocation `AaHBEDKdf16nBKXfFV9b9Q` |
| 7 | See usage and the resulting charge | Both costs `observed`, `delivered`; the cost summary names both apps; nothing pending | $0.000110992047033195 (chat) and $0.020114622927375474 (image) |

The builder's key was revoked at the end.

## Behind each cost

Each job's attempt recorded the session the signer signed. Cost sync matched it to one Batteries payment
session and one usage row, on this run's allocation. The rows add up to the engine's costs exactly.

| Job | Orchestrator | Manifest | Batteries session | Batteries usage row | Fee (ETH) | Fee (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| Chat | `hky.eliteencoder.net:8936` | `c7b8df10` | `AaHBEDZEfzmXqsU-L9bTkw` | `AaHBEDjFexa96v-ZPzCwqw` (applied) | 0.0000000517669885 | 0.000110992047033195 |
| Image | `ai1.eliteencoder.net:8936` | `session_k4v7mrau5enuim5i` | `AaHBED0RcFW4U2O0TbP_wg` | `AaHBEEB_dM-znXUmFHN1HA` (applied) | 0.000009381514095797 | 0.020114622927375474 |

- **Allowance.** $0 spent of $0.05 before the run, and $0.020225614974408669 after: the two costs added.
- **Reconciliation.** Balanced for the actor: Batteries' spend for the allocation equals the engine's
  delivered costs, and nothing is unattributed.
- **Timings.** Signing took 774 ms (chat) and 685 ms (image). The image runner took 23 s to answer.

## The payer

Read from Arbitrum One before and after, with the signer's RPC URL:

| | Block | Deposit | Reserve | Nonce |
| --- | --- | --- | --- | --- |
| Before | 522,724,689 | 0.14197116 ETH | 0.3366 ETH | 21 |
| After | 522,724,767 | 0.14197116 ETH | 0.3366 ETH | 21 |

The nonce did not move, so the payer sent no transaction. No ticket won, so nothing was redeemed from the
deposit.

## What this does not show

- **The cost is the tickets' expected value.** That is the network cost the engine records (builder-core
  `docs/contracts/payments.md`), not an on-chain settlement. No ticket won in a run this small, so no
  redemption appears on chain.
- **Batteries' escrow report was behind.** Its listener had only reached block 521,991,560, about two days
  behind, and reported a deposit of 0.15398508 ETH. The stack had been down since 6 November, and the
  listener was still catching up. The chain reading above is the current one.
- **Production does not run this engine.** Its deploys of `1514212` and `3520a38` were cancelled on 9
  November. The run used the local stack, built from the same pins.
- **The console's own image preset is stale.** The Builder's image preset still names
  `comfystream/fal-flux-schnell` (`web/src/domain/builder.ts`), so it fails until it moves to
  `text-to-image`. This run went through the REST API.
- **This is one configuration.** The remaining configuration matrix is ISS-36.

**Spend.** $0.0202 in this run and about $0.011 in the 2 November dry run. Both are well inside ISS-25's $1
cap.
