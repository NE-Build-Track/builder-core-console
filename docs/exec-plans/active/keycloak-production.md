# Production Keycloak and Google

## Status

Identity deployment and live connections verified; Builder proxy-origin correction is being deployed.

## Goal

Provide production Google sign-in through Keycloak, with a console that connects to an existing
remote engine and Batteries. Keep the Auth0 example independent. Supply all deployment access
and credentials externally; no host inventory or access keys belong in this change.

## Acceptance

- [x] Production Keycloak with persistent identity storage, exact HTTPS callbacks and strict API tokens.
- [x] Signup grants builder access without operator privileges, account linking or spending allocations.
- [x] Explicit operator provisioning uses existing identity UUIDs and preserves client secrets on reruns.
- [x] Stack-wide pages and shared-layout aggregates require live operator authorization in production.
- [x] An existing Apache edge can retain its listeners and sites.
- [x] Remote-service mode starts only console and identity services; engine/payment state stays remote.
- [x] A dedicated Batteries credential permits only explicit read operations.
- [x] Offline checks, real Keycloak token/role checks and the application build pass.
- [x] Verify the remote engine accepts the deployed identity provider's reader token.
- [x] Complete the final user-driven Google sign-in check.

## Progress

- 2026-11-02: Created a separate branch from main and left the Auth0 example unchanged.
- 2026-11-02: Added production configuration, operator provisioning, Apache coexistence and remote-service mode.
- 2026-11-02: Typecheck, lint, 240 web tests and production build passed. Twelve Python provisioning/reader
  tests, Ansible syntax checks and Compose/Caddy validation passed.
- 2026-11-02: Real Keycloak checks verified issuer/JWKS, token type/audience, role gating, reader isolation,
  explicit operator grants/revokes and persistent realm state after recreation.
- 2026-11-02: Disposable Batteries checks verified anonymous reads 401, reader reads 200 and reader writes 403.
  The optional reader hook deployed successfully to the existing remote Batteries service and passed a read check.
- 2026-11-02: Console and identity services deployed over HTTPS, with protected read pages. Engine, Batteries,
  signer and the existing engine database remain remote; no wallet or ledger migration occurred.
- 2026-11-02: Live connection checks passed: engine reader access 200, anonymous and invalid-signature
  actor reads 401, Batteries reader access 200, protected-page redirects and private issuer endpoints.
- 2026-11-02: Deployment inputs remain external, and key-file patterns are excluded from version control.
- 2026-11-02: User confirmed Google Builder sign-in. A valid run was rejected by the proxy host comparison;
  changed the guard to compare the registered complete origin and added nine regression cases. All 249 web tests pass.

## Decision log

- 2026-11-02: Preserve Auth0 as an independent documented example.
- 2026-11-02: Keep existing engine/payment services and their database in place; connect the new console remotely.
- 2026-11-02: Use a separate private identity database, explicit operator grants and no automatic funding.
- 2026-11-02: Retain existing engine API-key access while adding trust for the production Keycloak issuer.
- 2026-11-02: Keep host inventories, access keys and credential values outside the repository.
