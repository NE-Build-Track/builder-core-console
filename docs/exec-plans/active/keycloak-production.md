# Production Keycloak and Google

## Status

Owner: eliteproxy. Implementation and local validation complete; live host inputs and deployment review pending.

## Goal

Add an independent production deployment from main with Keycloak, Google, PostgreSQL, HTTPS,
safe signup and a repeatable Ansible rollout to the operator's supplied SSH host. Keep the Auth0 PR separate.

## Acceptance

- [x] Production mode, persistent PostgreSQL, exact HTTPS callbacks and strict API-token mappings.
- [x] Google-only signup grants builder, never operator or spending allocations; no automatic email linking.
- [x] Configuration preserves generated secrets and explicit operator provisioning uses existing UUIDs.
- [x] Stack-wide pages and shared-layout aggregates require live operator authorization in production.
- [x] Ansible supports a private MobaXterm-derived inventory and Vault-backed deployment to a Linux host.
- [x] An existing Apache host can retain 80/443 and its other sites; Keycloak uses a loopback-only backend.
- [x] Offline checks, real Keycloak import/token checks and production build pass.
- [ ] Public DNS, Google credentials and verified SSH connection available for a live host rollout.

## Progress

- 2026-11-02: Created a fresh branch from main at the user's instruction; left Auth0 PR #15 unchanged.
- 2026-11-02: Added production Compose overlay, initial realm generation, operator/admin CLI and runbook.
- 2026-11-02: Added opt-in protection for stack reads and layout data, with unchanged local defaults.
- 2026-11-02: Added Ansible release deployment and a private inventory importer for the supplied `.moba` data.
- 2026-11-02: Isolated Keycloak/PostgreSQL containers imported the generated realm successfully in production mode.
- 2026-11-02: Typecheck, lint, 240 web tests and production build passed; HTTP and RSC read-gate smoke checks passed.
- 2026-11-02: Eight Python provisioning/inventory tests and Ansible syntax validation passed. Real reader-token,
  builder-default and operator grant/revoke checks passed, including the private provisioning CLI and realm recreation.
- 2026-11-02: The supplied bookmark resolved to an SSH endpoint and a PuTTY key reference. Read-only SSH stopped
  at strict host-key verification; no remote configuration changed. DNS/Google/SSH inputs requested from the operator.
- 2026-11-02: GitHub's OAuth credential refused workflow updates without `workflow` scope. Existing Actions
  configuration stays unchanged; the new Python/Ansible/container checks remain runnable through the documented commands.
- 2026-11-02: User selected ReportingWebsite instead of SmokePing, supplied AWS/Google credentials privately,
  and chose `app.eliteencoder.xyz` / `auth.eliteencoder.xyz`. Existing SSH host trust and OpenSSH key work.
- 2026-11-02: ReportingWebsite uses Apache on 80/443. Added an Apache Compose overlay, scoped virtual-host
  templates and a staged edge playbook. Ansible applied only the new HTTP challenge/redirect sites successfully.
- 2026-11-02: AWS identity verification succeeded, but the provisioning user lacks DNS write permission for
  the zone. User will add the two A records. Google callback registration was corrected and verified.
- 2026-11-02: Private Keycloak deployment on ReportingWebsite is healthy and serves its expected issuer.
  Corrected realm bind-mount permissions for a non-root Linux container; env credentials remain private.
- 2026-11-02: User narrowed rollout to console/identity on ReportingWebsite, retaining engine, Batteries,
  signer and the existing Postgres on Railway. Added a standalone remote-service Compose mode with no payer config.
- 2026-11-02: Railway login renewed; production metadata inspected. No signer/wallet or database migration occurred.
  A proposed PostgreSQL TCP endpoint was rejected by automatic approval review and was not created; the safer
  connection plan uses Keycloak's separate private local database and a dedicated Batteries reader.
- 2026-11-02: User explicitly approved that connection plan. Final names are `app.eliteencoder.net` and
  `issuer.eliteencoder.net`; `.xyz` is inactive. Verified final DNS, preserved existing identity/client secrets
  while updating callbacks/audience, and issued the two-domain certificate through the existing Apache edge.
- 2026-11-02: Added a narrow optional reader hook around the pinned Railway Batteries entrypoint. Disposable
  integration checks passed: anonymous reads 401, reader reads 200, reader writes 403, original operator reads 200.
  Started its deployment to the existing Railway Batteries service; no signer or database moved.

## Decision log

- 2026-11-02: User requested a separate branch/PR from main, preserving Auth0 as its own example.
- 2026-11-02: User requested Ansible deployment to the supplied SSH host instead of hosted app/database services.
- 2026-11-02: Production enables the existing OIDC path plus an opt-in read gate; local D7 defaults stay intact.
- 2026-11-02: Single host/console replica, explicit operator UUID grants, no auto-funding, no public Admin API.
- 2026-11-02: Live rollout requires DNS, Google credentials, an OpenSSH key and independently verified host fingerprint.
