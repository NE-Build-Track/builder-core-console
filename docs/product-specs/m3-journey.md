# The M3 jobs, journey and acceptance matrix (ISS-19)

Status: written 21 October 2026 from the M3 decisions
([record](https://github.com/Cloud-SPE/Network-Engineering-SPE/blob/main/docs/decisions/2026-10-21-m3-reference-app-and-scope.md),
decisions 1, 2 and 8). The final run fills in the pinned versions and evidence.

## The selected jobs

Both are **immediate** jobs: one request, one response. No asynchronous job (ISS-26) or persistent
endpoint (ISS-27) is needed, so neither moves into M3.

| | Chat | Image |
| --- | --- | --- |
| Offering | `blueclaw/chat/qwen3.8-27b` | `comfystream/fal-flux-schnell` |
| Path, method | `/v1/chat/completions`, `POST` | `/`, `POST` |
| Delivery | Streamed (`?stream=true`), server-sent events | Buffered, JSON |
| Input | OpenAI-style `messages`, `max_tokens: 200`, `stream: true`, `stream_options.include_usage` | `prompt`, `image_size: landscape_4_3`, `num_images: 1`, `enable_safety_checker: true`, `sync_mode: true` (since 30 October: the image inline, builder-core D59) |
| Advertised rate (21 Oct) | 4,492,197,255 wei per second | 1,212,893,258,909 wei per request |
| Expected output | Text arriving as events, ending `[DONE]`, with token usage | `images[0].url` as a `data:image/…;base64` URI, width and height (without `sync_mode`, a temporary fal URL that expires; the job and its cost stand when it does) |
| Expected record | `succeeded`; one attempt, paid; result `text/event-stream` | `succeeded`; one attempt, paid; result `application/json` |
| Expected cost | `observed`, about $0.0001, one ticket | `observed`, about $0.003, one ticket |
| Observed 21 Oct (dev runs) | $0.000111 in 1 ticket, twice | $0.003007 in 1 ticket, three times |

The presets in the Builder are these inputs (`web/src/domain/builder.ts`). The same prompt gives the
same image (fixed seed at the runner), and each run is still paid.

## The seven-outcome journey

All in the console, against the M3 dev stack ([m3-environment.md](../references/m3-environment.md)):

| # | Outcome | Step in the console | REST call | Evidence |
| --- | --- | --- | --- | --- |
| 1 | Obtain one credential | Operator issues an actor key; the builder signs in with it | `POST /v1/admin/keys`; `GET /v1/jobs` | Key id; session bar |
| 2 | Discover capabilities | Builder catalog | `GET /v1/offerings` | Offerings, freshness |
| 3 | Understand the expected rate | Catalog rate for the chosen offering | `GET /v1/offerings` | Rate, currency, unit, age |
| 4 | Invoke a capability | Run chat (streamed), then image | `POST /v1/jobs?stream=true`, `POST /v1/jobs` | Job ids, operation references |
| 5 | Receive a result or an understandable failure | Output views; the job record | the run's response; `GET /v1/jobs/{id}` | Text, image, state, attempts |
| 6 | Pay without holding crypto | The operator funded the grant and allocation; the builder only holds a key | `POST /v1/admin/grants`, `.../allocation`, `.../allocation/fund` | Grant and allocation ids; allowance |
| 7 | See usage and the resulting charge | Job record cost; Usage and cost tab | `GET /v1/jobs/{id}/cost`; `GET /v1/costs/summary`; `GET /v1/allowance` | `observed` cost in USD; spent against granted |

The final run (ISS-25) records each step's ids and the Batteries rows behind each cost, as the M2
evidence did.

## What M3 covers, and what moves to M4

| Dimension | M3 | M4 |
| --- | --- | --- |
| Execution modes | Immediate, buffered and streamed | Asynchronous with stored results (ISS-26); persistent endpoints (ISS-27) |
| Interfaces | REST, through the console | MCP (ISS-30); complete REST coverage (ISS-29) |
| Engine use | As a service (`lpb serve`) | Embedded and service side by side (ISS-32); ChatLPT is the embedded showcase |
| Access | Engine keys issued by the operator | Enterprise sign-in replacing the console's flow (ISS-33) |
| Payment configurations | `per_actor` (one allocation per actor) | `per_application` (one shared allocation) (ISS-31) |
| Recovery | Failures after payment shown as `failed_after_payment`, or `uncertain` when the runner may have run; a failover after payment shows each attempt's class | Broader recovery coverage (ISS-35) |
| Catalog | Two jobs; the rest of the catalog visible but not tested | More representative jobs as needed; no full-catalog test |

Held: the integration events feed in ISS-18, revisited when there is room (decision 4).
