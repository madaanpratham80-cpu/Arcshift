# Proposal

## Why

A saved career profile needs a structured, actionable roadmap that stays available as milestones change.

## What Changes

- Queue an owner-scoped Qwen run from the saved profile and persist the validated first roadmap.
- Add current roadmap, milestone progress, progress evidence, and version history endpoints.
- Protect roadmap saves from stale profiles and concurrent writes. Support retries and idempotent requests.

## Capabilities

### New Capabilities

- `career-roadmap` governs initial plan generation, milestone progress, version history, and run recovery.

### Modified Capabilities

None.

## Impact

New roadmap and AI run routes, a server-side Qwen adapter, a MongoDB job worker, and transaction-backed persistence.
