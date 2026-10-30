# The M3 journey, step by step (ISS-24)

From a clean checkout to a paid job and its cost, as an operator and then as a builder. Written for
the versions in [payment-stack.md](../references/payment-stack.md); the M3 jobs and what to expect are
in [m3-journey.md](../product-specs/m3-journey.md). No step needs a secret written down anywhere but
`deploy/`.

## What you need

- Docker with Compose, Node 24 and pnpm (only to develop), Python 3.
- The payer's keystore, its password and an Arbitrum One RPC URL, with a funded TicketBroker deposit
  and reserve (the operator's, not the builder's), or ChatLPT's `deploy/secrets/` to copy.
- ChatLPT's stack stopped: both sign with the same payer.

## 1. Install and start the stack

```sh
git clone https://github.com/NE-Build-Track/builder-core-mgmt-ui && cd builder-core-mgmt-ui
make install
# secrets: copy ChatLPT's (deploy/README.md#secrets), then
python3 deploy/init-secrets.py
cp deploy/.env.example deploy/.env && chmod 600 deploy/.env
make images
deploy/first-run.sh
make up
```

Open <http://127.0.0.1:3060>. **Health** should say Operational: the signer can pay and discovery is
fresh. If the signer is not ready, its reason is on that page.

The engine itself is described in builder-core's docs: its
[README](https://github.com/NE-Build-Track/livepeer-builder-core#readme), the engine contract
(`docs/contracts/engine.md`) and the REST walkthrough every step below sends,
[`docs/guides/rest-builder.md`](https://github.com/NE-Build-Track/livepeer-builder-core/blob/9e447ce8da4b78c4d155b470da1228d1c766f180/docs/guides/rest-builder.md).
Each REST call in this journey, and the console action that sends it, is listed in
[m3-rest-operations.md](../references/m3-rest-operations.md). To use the engine embedded in your own
Python app instead, see its embedded walkthrough
([NE-Build-Track/livepeer-builder-core#26](https://github.com/NE-Build-Track/livepeer-builder-core/pull/26)).

## 2. As the operator: fund an actor

Go to **Operator**. Sign in with the admin key: `grep ^CONSOLE_ENGINE_ADMIN_TOKEN= deploy/.env`.

1. **Create a grant**, for example $1. Review shows the request; confirm.
2. **Issue a key** for a new actor id, for example `acme-studio`, kind actor. The key is shown **once**:
   copy it.
3. The actor appears under Actors as not provisioned. **Provision** it from your grant with, say,
   $0.25. Review shows the grant's unallocated balance before and after.
4. Back on the issued key's result, or with the copied key: **Use it in the Builder area**.

Each dialog's request panel has **Copy as curl**: the same call against `$ENGINE_URL` with `$LPB_KEY`.
Every command that moves money or creates a key carries an `operation_ref` (the engine refuses it
without one, 422); the dialog makes it and keeps it, so sending twice applies once (builder-core D57).
Revoking twice is safe too: a repeat answers as the first did (D61).

## 3. As the builder: discover, run, see the cost

In **Builder** (signed in with the actor key):

1. **Catalog and run.** Find `blueclaw/chat/qwen3.8-27b`: its ready runners and its rate in wei per
   second, read seconds ago. This is the wholesale network rate; an app sets its own retail price.
2. Choose the **Chat** example and **Run (paid)**. The reply streams into Rendered (Raw shows the events).
   Below it, the job record: `succeeded`, one paid attempt, and the network cost going from pending to
   observed within a minute (about $0.0001).
3. Choose **Image** and run it: the example sends `sync_mode: true`, so the picture comes back inside the
   JSON as a data URI and appears above it; the cost is about $0.003. Save it if you want it: the engine
   keeps no result (D59).
4. **My jobs** lists both, each with its attempts. **Usage and cost** shows the allowance spent, the cost
   by class, and the cost per app and class (`by_app`, D60): delivered, failed after payment and
   uncertain are final, and pending, which can still grow, stays in its own column.

A failure, or a refused run, is told in the engine's failure table's words (D58): what happened, what it
means and what to do, with the engine's own message and code beside them. For a payment: `not_authorized`
(403: an operator checks the allocation and key), `allowance_exhausted` (402: an operator funds the
allocation), `signer_unavailable` (503: retry after the 10 s the engine asks for) or `signer_unknown`
(503: it may have charged; do not retry blindly). A request body over 16 MiB is refused with 413 and the
limit (D59).

## Known limitations (M3)

- Results are returned inline, once; the engine stores no result body (`GET /v1/jobs/{id}/result` is 501
  until M4). Without `sync_mode`, FLUX schnell answers with a fal URL that expires: the job stays
  succeeded and its cost stands, and the console says the provider no longer serves the image.
- My jobs shows the 50 newest; the engine pages with `before` (D59), which the console does not use yet.
- The events feed is held for M3 (`GET /v1/events` is 501, `milestone: "held"`, D60).
- Rates are in wei; there is no USD rate before a run (gap G14). Costs afterwards are in USD.
- The Builder learns the actor id from the key's first job (gap G13).
- Every admin command that moves money or creates a key carries an operation reference, made when its
  dialog opens and kept through Back, Try again and a closed dialog, so a repeat is applied once
  (builder-core D57). A repeated key issue or rotation cannot show the token again: rotate the key if
  nobody copied it.
- The stack runs on one machine, on loopback, sharing its payer with ChatLPT.
