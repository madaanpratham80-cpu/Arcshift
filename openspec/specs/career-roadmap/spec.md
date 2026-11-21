# career-roadmap Specification

## Purpose
Turn a saved career profile into an actionable roadmap and keep progress and prior versions available.

## Requirements

### Requirement: Initial roadmap generation

The service SHALL queue generation for the authenticated owner's saved profile version. It SHALL validate the Qwen draft, verify the profile version at publication, assign milestone IDs and initial status on the server, and commit at most one initial roadmap per owner.

#### Scenario: Generation completes

- **WHEN** a valid provider response arrives for the current profile version
- **THEN** the run succeeds and the API exposes the saved roadmap at version 1

#### Scenario: Profile changes during generation

- **WHEN** the profile version changes before publication
- **THEN** the run fails with `PROFILE_VERSION_CONFLICT` and creates no roadmap

### Requirement: Owner-scoped run recovery

The service SHALL persist owner-scoped runs and admit at most one active initial generation per owner. Users SHALL be able to poll their own runs and retry eligible failures. Generation SHALL recover the original run for an identical idempotency key and input. Expired attempts SHALL be prevented from publishing.

#### Scenario: Generation is interrupted

- **WHEN** a worker stops before publication and its lease becomes available
- **THEN** another attempt can complete the existing run without creating a duplicate roadmap

### Requirement: Milestone progress

An owner SHALL be able to change milestone status and set or clear an optional evidence URL. A change SHALL atomically publish a new version and record an event. Updates SHALL match the expected version. Replaying the same idempotency key and input SHALL return the original outcome.

#### Scenario: Two edits compete

- **WHEN** two different edits target the same current version
- **THEN** one commits and the other receives `ROADMAP_VERSION_CONFLICT`

### Requirement: Roadmap reads and history

The service SHALL return the owner's active roadmap and paginated history with stable milestone IDs and progress. The dashboard read SHALL expose the latest generation run while the roadmap is absent. Prior versions SHALL remain immutable.

#### Scenario: Reopen an earlier version

- **WHEN** an owner reads a previous version after editing progress
- **THEN** the original milestone status and evidence are available
