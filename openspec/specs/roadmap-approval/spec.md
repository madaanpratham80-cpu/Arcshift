# roadmap-approval Specification

## Purpose
Let an account owner inspect and explicitly apply a validated roadmap change proposed in coaching.

## Requirements

### Requirement: Reviewable roadmap preview

A coaching turn that requests a revision SHALL attempt to prepare a versioned proposal from the saved roadmap, saved profile and current user message. The backend SHALL validate allowed edits and expose a rationale and diff. A preview SHALL leave the active roadmap intact.

#### Scenario: Coach suggests a justified change

- **WHEN** a proposal passes validation
- **THEN** the finished run exposes the owner-scoped proposal ID and preview

#### Scenario: Proposal generation fails

- **WHEN** the coaching reply is valid and the proposal is unavailable
- **THEN** the reply still succeeds and its run reports proposal unavailability

### Requirement: Guarded approval

The API SHALL apply the owner's proposal only on explicit approval. It SHALL match both saved base versions and atomically commit the revised plan, affected progress events, and approval state. Replaying an approved proposal SHALL return the version created by that approval.

#### Scenario: Profile or roadmap changed after preview

- **WHEN** the owner approves a proposal with an outdated base version
- **THEN** the API returns `409 PROPOSAL_STALE` and preserves current state

#### Scenario: Approval is submitted twice

- **WHEN** the owner repeats a successful approval
- **THEN** the API returns the original applied version and records no duplicate progress

### Requirement: Validated revision semantics

A proposal SHALL use only allowed edit types, reference existing or newly declared items, and preserve prior versions. Proposed progress SHALL cite a direct report in the latest user message. A target change SHALL match the saved target. Completed milestone definitions and evidence SHALL stay available.

#### Scenario: Target role changes

- **WHEN** an approved proposal switches to the saved target role and retires a completed item
- **THEN** the preview shows the retirement and the original version retains the completed item and its evidence
