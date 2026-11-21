# Proposal

## Why

The coach needs a saved, editable account profile before it can build a personalized roadmap.

## What Changes

- Add authenticated profile read and save endpoints.
- Persist background, skills, target role, weekly availability, and optional constraints.
- Return onboarding status from the saved record and use a version check for updates.
- Document the profile contract and verify ownership, validation, and concurrent saves.

## Capabilities

### New Capabilities

- `career-profile` covers personal career context and onboarding completion.

### Modified Capabilities

None.

## Impact

Express profile routes, session response, and the MongoDB profile collection. Roadmap generation can use the saved profile in Step 5.
