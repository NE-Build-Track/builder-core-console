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

## Decision log

- 2026-11-02: User requested a separate branch/PR from main, preserving Auth0 as its own example.
- 2026-11-02: User requested Ansible deployment to the supplied SSH host instead of hosted app/database services.
- 2026-11-02: Production enables the existing OIDC path plus an opt-in read gate; local D7 defaults stay intact.
- 2026-11-02: Single host/console replica, explicit operator UUID grants, no auto-funding, no public Admin API.
- 2026-11-02: Live rollout requires DNS, Google credentials, an OpenSSH key and independently verified host fingerprint.
