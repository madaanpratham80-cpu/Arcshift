# Proposal

## Why

Arcshift needs to run on Vercel with its React frontend and MongoDB-backed Express API on the same HTTPS origin.

## What Changes

- Package one Express function and serve the fingerprinted React assets from Vercel's CDN.
- Dispatch AI jobs from authenticated requests while preserving MongoDB job leases and the local continuous worker.
- Document cloud database, production secrets, and OAuth setup.

## Capabilities

### New Capabilities

- `vercel-hosting` covers build output, readiness, and request-scoped AI work.

## Impact

Vercel packaging, server startup, AI job dispatch, and deployment instructions.
