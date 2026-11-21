# backend-release Specification

## Purpose
Make backend configuration, traffic readiness, and locally repeatable release verification explicit.

## Requirements

### Requirement: Production configuration and readiness

Production startup SHALL require authentication and database configuration. Readiness SHALL verify MongoDB indexes and transaction support when production or AI work is enabled. Liveness SHALL remain independent of database and provider readiness.

#### Scenario: MongoDB accepts only standalone operations

- **WHEN** production is running with a database that lacks transactions
- **THEN** liveness returns HTTP 200 and readiness returns HTTP 503

### Requirement: Backend smoke tests

A documented local command SHALL build the backend and run its regression and deployment smoke suites against isolated fixtures.

#### Scenario: Compiled production backend restarts

- **WHEN** the compiled server starts, uses secure session cookies, stops gracefully, and restarts against the same database
- **THEN** its readiness and authenticated saved-data reads are verified
