# Design

## Context

The existing HTTP contract exposes dependency-independent liveness and a request ID on every response. A separate readiness endpoint adds the state that a deployment needs for traffic routing.

## Goals / Non-Goals

Connect to MongoDB, initialize the identity and session prerequisites, and expose independent probes. Authentication flows and their business rules follow in Step 3.

## Decisions

- Create one MongoDB client per process. Share an in-flight readiness check so simultaneous health probes reuse the same database work.
- Warm up on listener startup. Explicitly reconnect on the next probe if initial connection failed, then retry incomplete index initialization. After initialization, ping the primary for each readiness check so outages and recovery are visible without a process restart.
- Use named, idempotent indexes. Keep the partial Google index limited to string subjects so local accounts may omit that field. Use an absolute expiry field for TTL cleanup. Authentication will still check expiry during requests.
- Use bounded driver timeouts and log only the failure category. Return request IDs and generic error copy to clients.
- Drain HTTP connections before closing the MongoDB client. The existing HTTP shutdown deadline bounds connections that are still open.

## Risks / Trade-offs

Index creation requires a deployment identity with the necessary permissions. Conflicting indexes keep the API unready and require operator review. Production will need a replica set for transactional features.
