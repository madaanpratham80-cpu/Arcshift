## ADDED Requirements

### Requirement: Same-origin application on Vercel

The Vercel deployment SHALL serve the React application, static assets, and the Express API on the same origin.

#### Scenario: Direct browser navigation

- **WHEN** a visitor opens a supported UI route directly
- **THEN** the Express function returns the React document and Vercel serves the fingerprinted assets

#### Scenario: Unknown route

- **WHEN** an unknown page or API route is requested
- **THEN** the application responds with an HTTP 404 and the appropriate HTML or JSON format

### Requirement: Hosted database readiness

Arcshift SHALL use a hosted MongoDB replica set or sharded deployment and report readiness only after the required database operations are available.

#### Scenario: Database unavailable

- **WHEN** MongoDB cannot be reached or does not support transactions
- **THEN** the readiness endpoint returns HTTP 503

### Requirement: Request-scoped AI dispatch

The Vercel runtime SHALL claim jobs via their durable MongoDB leases when an authenticated user enqueues, retries, or polls an eligible run.

#### Scenario: Concurrent dispatch

- **WHEN** multiple authorized requests attempt to start the same available job
- **THEN** only the handler that acquired its current lease may publish the result
