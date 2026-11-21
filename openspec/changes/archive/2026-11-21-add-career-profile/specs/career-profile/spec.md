# Career Profile

## Purpose

Store the signed-in user's career context for onboarding, profile editing, and future roadmap generation.

## ADDED Requirements

### Requirement: Owner-specific profile

`GET /api/profile` and `PUT /api/profile` SHALL require an active user session. The service SHALL select records by the session's account ID and keep at most one profile per account. A profile read SHALL return the record or `null`.

#### Scenario: New account

- **WHEN** a signed-in account without a profile requests its profile
- **THEN** the service returns HTTP 200 with `data.profile` set to `null`

#### Scenario: A different user is named in a request

- **WHEN** a signed-in user supplies another account's ID in a profile query or body
- **THEN** the service never reads or writes the other account's profile

### Requirement: Career context validation

The service SHALL validate a bounded background, skills, target role, and weekly hours. It SHALL support optional budget and notes, remove duplicate skill labels, and reject fields outside the profile contract. A save SHALL require the configured same origin.

#### Scenario: Save valid career context

- **WHEN** the account sends a valid profile with zero expected version and no existing record
- **THEN** the service returns HTTP 201 with the saved profile at version 1

#### Scenario: Reject invalid input

- **WHEN** a profile contains invalid values or server-owned fields
- **THEN** the service returns HTTP 400 with `VALIDATION_FAILED` and preserves the existing record

### Requirement: Versioned profile updates

Every profile save SHALL provide `expectedVersion`. An update SHALL apply only to a profile owned by that account and matching the supplied version. Each successful edit SHALL increment the version and preserve the creation timestamp.

#### Scenario: Two edits target the same version

- **WHEN** two clients submit different edits with the same current version
- **THEN** one edit succeeds and the other receives HTTP 409 with `PROFILE_VERSION_CONFLICT`
- **AND** refreshing the profile returns the committed version and edit

### Requirement: Onboarding state

The active session response SHALL return `data.onboardingComplete` based on whether the account has a saved career profile.

#### Scenario: Finish onboarding and return later

- **WHEN** an account saves its first valid profile and retrieves its session in a later request
- **THEN** the session reports onboarding complete and the profile remains available
