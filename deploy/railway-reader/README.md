# Read-only Batteries connection for a remote console

This optional Railway deployment adds `CONSOLE_READER_TOKEN` to the existing Batteries credential
file. It retains the same `ca09e47` binary pin, private networking, five existing service credentials,
database path, migration command and process startup. It creates no grants or allocations and does
not read or transfer payer keys. The checked-in base entrypoint comes from builder-core commit
`eb3c3ba5013dec55fe0239274f351f717500ca2a`, `deploy/railway/batteries/entrypoint.py`.

`console_reader.py` applies a guarded source patch at build time. The patch fails if either expected
anchor changes. The optional credential permits only eight explicitly listed `.read` operations;
it has no webhook, Kafka or write access. Unset leaves the existing credential file unchanged.

Use an existing Railway Batteries service with its existing `/data` volume and variables. Generate
one persistent 64-character lowercase hex token in your secret store. Pass it through stdin to
`railway variable set CONSOLE_READER_TOKEN --stdin --skip-deploys --service batteries --environment production`.
Do not print resolved variables or put the token on the command line. Then deploy this folder:

```sh
python3 -m unittest discover -s deploy/railway-reader -v
railway up deploy/railway-reader --path-as-root --service batteries --environment production
railway domain --service batteries --environment production --port 8081 --json
```

Deploying restarts Batteries briefly and keeps its volume and other credentials. Review the target
project/environment before running these commands. Do not deploy to the signer or Postgres service.
Existing GitHub auto-deploy configuration must retain this hook, or a later rebuild from the old
entrypoint will remove the reader credential. Apply the equivalent optional hook upstream before
switching this service back to that source; keep this folder as the reproducible deployment source.

Configure only the resulting HTTPS URL and this token on the console:

```text
CONSOLE_BATTERIES_URL=https://YOUR_BATTERIES_DOMAIN
CONSOLE_BATTERIES_TOKEN=THE_READ_ONLY_TOKEN
```

Verify unauthenticated management reads return 401, the reader can GET `/v1/grants`, and writes with
the reader return 403. Tests must use a disposable local database for attempted write requests; no
production paid jobs or funding calls are needed. The remaining operator/engine/signing credentials
stay inside Railway. See the [remote deployment guide](../ansible/README.md#full-stack-and-repeat-releases).
