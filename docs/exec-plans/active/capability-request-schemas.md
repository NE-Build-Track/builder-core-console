# Capability request schemas

## Status

Candidate implementation over a Core API extension; review and deployment pending.
The production engine currently has the original API. Existing job execution remains
unchanged until the reviewed Core schema endpoint is deployed.

## Goal

Initialize the selected offering with its engine-provided operation path and declared
defaults, while keeping required prompt/media inputs unfilled for the builder.

## Acceptance

- [x] Read authenticated `GET /v1/capabilities` through the typed engine adapter.
- [x] Replace previous customer input when an offering changes.
- [x] Preserve zero/false/nested defaults and exact model identity.
- [x] Show schema-read failures and preserve manual input for older engines.
- [x] Pass console type checks, lint and all 217 tests.
- [ ] Finish production build, review Core/console changes, update reviewed pins and deploy.
- [ ] Exercise five paid operations with existing production Builder access.

## Progress

- 2026-11-03: FAL remains enabled following the user's revised deployment instruction.
  Restore its native root path and provider JSON using 73 reviewed contract snapshots,
  verified against Engine runner metadata on selection and before dispatch. The native
  five-model catalog keeps its standard media paths. API consolidation into offerings
  or runners is deferred to the upstream issue discussion. Further paid tests were
  cancelled by the user after FLUX succeeded; no earlier uncertain operation is replayed.

- 2026-11-03: Required fields without defaults now appear as empty placeholders in
  the request template. Client and server schema validation reject incomplete input,
  wrong model/path/method, unsupported parameters and streaming before a paid job opens.
  The five native models require prompt, image or file values supplied by the builder.
  Image response envelopes render previews; audio has a player and mesh/audio/image
  assets have downloads. Raw responses remain available without truncation.
  New console changes require human review before committing or publishing.

- 2026-11-02: Added typed schema reads and isolated input initialization. Engine-provided
  paths replace the fixed chat/image assumption. Unit and structural tests pass.

## Decision log

- 2026-11-02: User identified the Builder console and Core as the owners of schema parsing.
  Keep writes in the existing Builder run flow; schema reads never run inference.
- 2026-11-02: Do not fabricate valid required media. Inline media is user-supplied;
  remote URLs and filesystem paths remain rejected by the deployed runner.
