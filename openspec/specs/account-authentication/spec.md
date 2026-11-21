# account-authentication Specification

## Purpose
Give each career agent account a verified sign-in boundary and a revocable browser session.

## Requirements

### Requirement: Password authentication

The backend SHALL register a canonical email with a bcrypt password hash and sign in using verified credentials. It SHALL bound credential input and rate-limit password attempts. Authentication responses SHALL omit credential material.

#### Scenario: Register and log in

- **WHEN** a user registers a valid email and password or logs in with valid credentials
- **THEN** the backend returns the account identity and issues session cookies

#### Scenario: Reject an invalid login

- **WHEN** the email is unknown, the account has no password, or the password is incorrect
- **THEN** the backend returns the same `INVALID_CREDENTIALS` response

### Requirement: JWT browser session

The service SHALL use signed, expiring access JWTs and hashed opaque refresh credentials. It SHALL rotate refresh credentials atomically, check session expiry and revocation on protected routes, and require a trusted origin for auth mutations. Production cookies SHALL be Secure and HttpOnly.

#### Scenario: Refresh an existing session

- **WHEN** a client uses the current unexpired refresh credential
- **THEN** the backend issues a replacement access JWT and refresh credential
- **AND** the consumed credential cannot refresh the session again

#### Scenario: Log out and revoke access

- **WHEN** the browser logs out from its current session
- **THEN** the service revokes that session, clears its cookies, and rejects subsequent use of its access and refresh credentials

### Requirement: Google authentication

The service SHALL use the Google authorization code flow with PKCE, state, and nonce. It SHALL verify the signed ID token and identify returning Google users by subject. Matching email alone SHALL require the existing account holder to link Google after confirming their password.

#### Scenario: Sign in with a verified Google account

- **WHEN** the callback matches the browser flow and the Google ID token passes verification
- **THEN** the service opens a new or existing Google account session

#### Scenario: Google email matches an existing local account

- **WHEN** a verified Google subject is unlinked and its email matches an existing account
- **THEN** the service requests explicit linking before granting access

#### Scenario: Link Google from a password account

- **WHEN** a signed-in user confirms their password and completes Google authorization within the same active session
- **THEN** the service adds the verified Google subject to that user's account
