# Design

## Context

The project starts with the backend from the architecture blueprint. The first HTTP contract supports local development and future deployment probes.

## Goals / Non-Goals

Build an executable Express service with predictable liveness and error responses. MongoDB readiness and career features follow in separate changes.

## Decisions

- Pin Node.js 24 and compile TypeScript for the production entry point. Use Node's TypeScript support for local watch mode to avoid a second runtime toolchain.
- Separate Express app creation from listening. Tests can pass a configured app into a local HTTP server, and production startup owns the bind address and signal handling.
- Use server-generated request IDs and a generic 500 response. Future route modules can use the shared JSON error format.
- Keep the liveness probe independent of storage. Add the dependency-aware readiness probe alongside MongoDB.

## Risks / Trade-offs

Liveness proves that the process is accepting HTTP requests. Deployment will use a separate readiness probe once external dependencies are configured.
