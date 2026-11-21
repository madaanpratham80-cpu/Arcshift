# mongodb-runtime Specification

## Purpose
Initialize the persistence layer for accounts and expose whether the API has a usable MongoDB connection.

## Requirements

### Requirement: MongoDB configuration

The backend SHALL use `MONGODB_URI` and `MONGODB_DB` for its database connection. The process SHALL reject invalid or partial configuration without exposing credentials. When both variables are unset, the HTTP service SHALL start with readiness unavailable.

#### Scenario: Incomplete database configuration

- **WHEN** only one required database variable is provided
- **THEN** startup exits unsuccessfully with a message naming the missing setting and omitting connection details

### Requirement: Account and session indexes

The backend SHALL install a unique index on `users.emailCanonical`, a unique partial index on string values of `users.googleSub`, and an expiry index on `authSessions.expiresAt` before reporting readiness.

#### Scenario: Empty database becomes usable

- **WHEN** the backend connects to an empty database with index permissions
- **THEN** it installs all three indexes and repeated initialization leaves a single copy of each index

#### Scenario: A required index cannot be created

- **WHEN** a conflicting index or duplicate account data prevents index creation
- **THEN** the backend remains unready and preserves the existing data

### Requirement: Database readiness probe

The unauthenticated `GET /readyz` endpoint SHALL return HTTP 200 only after indexes are initialized and a ping to MongoDB's primary succeeds. Unavailable states SHALL return HTTP 503 with the JSON error envelope. Responses SHALL be uncached.

#### Scenario: Database is reachable

- **WHEN** initialization succeeds and the database responds to the probe
- **THEN** the API returns HTTP 200 with `{"data":{"status":"ready"}}` and `Cache-Control: no-store`

#### Scenario: Database becomes unreachable and then returns

- **WHEN** the database stops responding
- **THEN** `/readyz` returns HTTP 503 with code `NOT_READY` and the request ID, while `/healthz` still returns HTTP 200
- **AND** a later successful probe returns HTTP 200 after connectivity is restored

### Requirement: Database shutdown

The backend SHALL close its MongoDB client after draining HTTP requests on normal process shutdown.

#### Scenario: Stop signal during normal service

- **WHEN** the API receives a termination signal
- **THEN** it stops accepting requests and releases the MongoDB client before exiting
