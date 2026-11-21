# Proposal

## Why

Authentication will need a persistent database and enforceable identity constraints. Deployment also needs to distinguish a running process from a backend that can use MongoDB.

## What Changes

- Read MongoDB connection settings from server environment variables and reuse a single client.
- Create the account identity indexes and session expiry index before reporting readiness.
- Expose `GET /readyz` with a recoverable, credential-free status.
- Keep the existing dependency-independent `GET /healthz` contract.

## Capabilities

### New Capabilities

- `mongodb-runtime` covers database configuration, account indexes, and database readiness.

### Modified Capabilities

None.

## Impact

Express startup and shutdown, the health API, and MongoDB collections `users` and `authSessions`. The next backend change implements account behavior.
