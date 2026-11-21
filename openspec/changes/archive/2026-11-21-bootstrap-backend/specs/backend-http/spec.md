# Backend HTTP

## Purpose

Provide a lightweight process liveness probe and a consistent error response that clients can report with a request identifier.

## ADDED Requirements

### Requirement: Liveness probe

The running backend SHALL expose an unauthenticated `GET /healthz` endpoint that returns a successful JSON response without calling an external dependency.

#### Scenario: Running API reports liveness

- **WHEN** a client requests `GET /healthz`
- **THEN** the API returns HTTP 200 with `{"data":{"status":"ok"}}` and `Cache-Control: no-store`

### Requirement: API error responses

The backend SHALL issue a fresh `X-Request-Id` for each request and return JSON HTTP errors with `code`, `message`, and the matching `requestId`. Unexpected failures SHALL use a generic message.

#### Scenario: Route does not exist

- **WHEN** a client requests an unknown API route
- **THEN** the backend returns HTTP 404 and code `NOT_FOUND` with the matching request ID

#### Scenario: An uncaught handler failure occurs

- **WHEN** a handler raises an unexpected error before sending a response
- **THEN** the backend returns HTTP 500 and code `INTERNAL_ERROR` with a generic message and the matching request ID
