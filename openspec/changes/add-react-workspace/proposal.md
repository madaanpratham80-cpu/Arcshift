# Proposal

## Why

The backend is ready for a browser client. Users need a single workspace for building and revisiting a career plan.

## What Changes

- Add a responsive React client for accounts, onboarding, roadmaps, coaching, history, and proposal approval.
- Serve the built frontend and existing Express API on the same origin.
- Verify the complete browser journey against the backend with isolated MongoDB and provider fixtures.

## Capabilities

### New Capabilities

- `career-workspace` governs the browser experience and its integration with the backend.

### Modified Capabilities

None.

## Impact

React and Vite source under `web/`, same-origin Express serving, browser checks, and local run instructions.
