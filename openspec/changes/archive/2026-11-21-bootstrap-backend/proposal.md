# Proposal

## Why

The career agent needs an executable backend and a stable HTTP contract before the team adds MongoDB, accounts, and coaching.

## What Changes

- Start an Express API on Node.js 24 with TypeScript.
- Expose a liveness endpoint and consistent JSON errors with server-generated request IDs.
- Verify the compiled backend over HTTP and generate a local Graphify code graph.

## Capabilities

### New Capabilities

- `backend-http` provides service liveness and a shared HTTP error contract.

### Modified Capabilities

None.

## Impact

Initial Node.js package, Express service entry point, and HTTP smoke test. This change covers the local backend foundation.
