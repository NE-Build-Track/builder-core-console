# Draft: engine payment reads for remote consoles

Status: enhancement proposal for builder-core; no new engine routes are implemented here.
Tracked as [G16](gaps.md#g16-engine-api-does-not-cover-batteries-only-console-reads).

The production console should authenticate only to the engine with its existing Keycloak identity.
Batteries management credentials and connectivity belong inside the engine's deployment. The
remote console therefore leaves its direct Batteries adapter unconfigured. Existing engine job,
allowance, cost and reconciliation reads remain available; other figures say unavailable.

## Proposed API coverage

Confirm the current engine contract before choosing route names. These are proposed resources,
not endpoints the console may call yet. Reuse existing engine responses where they cover the need.

| Console need | Proposed engine coverage | Authorization |
| --- | --- | --- |
| Grants and allocations on Money | Paginated grant/allocation summaries, available and spent amounts, status and application/actor attribution | Operator read scope, application constrained |
| Gateway credential status on Money | Allocation credential metadata: prefix, revoked state, last-used timestamp; never credential values | Operator read scope |
| Usage and job payment attribution | Cursor-paged payment events with job/manifest, application, actor, orchestrator, session and allocation identifiers; USD and ETH fees | Builder's own actor; operator read scope for broader views |
| Ledger totals on Money | Account balances and reconciliation with explicit coverage and currency | Operator read scope |
| Payer escrow on Money | Deposit/reserve balances, observed block and observation time | Operator read scope; explicit permission if global payer data crosses application boundaries |
| Payment dependency on Health | Sanitized dependency readiness, observation time and error category | Operator read scope; no internal addresses or credentials |

## Contract and trust requirements

- Authenticate using the engine's existing JWT/API-key mechanism. Enforce permissions and
  application/actor boundaries inside the engine on every read. A builder cannot enumerate
  another actor's usage, and a background reader cannot invoke a payment write.
- Use the engine's existing read scope where appropriate. Review a narrower payment-read scope
  if these resources expose more than the current auditor role should see. Do not grant it to
  all Google signups or rely on a console role check for authorization.
- Represent amounts as decimal strings with currency/unit. Include source, observation time,
  synchronization watermark and coverage. Distinguish an empty result from unavailable data;
  never convert an upstream failure into a zero balance.
- Bound page size; provide opaque cursors and since/until filters. Support application, actor,
  job/manifest and allocation filters where meaningful. Include quarantined events with their
  disposition so attribution totals do not silently omit them.
- Return a stable sanitized upstream-unavailable response, with retry information if known.
  State whether a response is a synchronized engine projection or a live upstream read.
- Return no API tokens, signing material, database connection strings or raw upstream errors.
  Do not make a general-purpose Batteries proxy or expose write-through routes.

## Acceptance and rollout

1. Inventory existing engine reads against the table, and add only the missing coverage to its
   OpenAPI contract with examples for successful, empty, partial and unavailable responses.
2. Test builder, reader and operator permissions; cross-actor/application requests; exact
   decimals; pagination/time filtering; and upstream outage/sync lag. Prove reads cannot fund,
   allocate, rotate credentials or sign a payment. Use disposable payment fixtures.
3. Keep existing engine payment configuration and private Batteries/Postgres networking.
   The console receives only an engine URL and engine-issued access tokens.
4. After the engine change is reviewed and released, pin that contract in this repository,
   wire the new reads, update the source labels and close G16 only when coverage is verified.

The existing local stack's optional direct Batteries adapter is retained for its current
deployment contract. This proposal replaces that dependency for remote deployments without
requiring a custom Railway entrypoint or a public Batteries management endpoint.
