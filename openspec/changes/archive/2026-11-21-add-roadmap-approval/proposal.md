# Proposal

## Why

Coaching recommendations need a reviewable path to change a saved roadmap, and the backend needs a repeatable release check.

## What Changes

- Generate a preview from a completed coaching turn and expose its rationale and diff.
- Apply an approved preview transactionally against its original profile and roadmap versions.
- Preserve prior versions, completed evidence, and progress events.
- Verify startup, readiness, secure cookies, restart, and shutdown with the compiled backend.

## Capabilities

### New Capabilities

- `roadmap-approval` governs validated previews and explicit approval.
- `backend-release` governs production startup and readiness checks.

### Modified Capabilities

None.

## Impact

Coaching run results, new proposal routes, versioned roadmap persistence, and deployment documentation and integration tests.
