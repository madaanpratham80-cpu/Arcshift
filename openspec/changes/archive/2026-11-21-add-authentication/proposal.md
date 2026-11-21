# Proposal

## Why

Career records need a verified account boundary. Users need to sign in with a password or Google and return to their account across browser sessions.

## What Changes

- Add email/password registration and login with bcrypt.
- Issue short-lived JWT access cookies and rotate persistent refresh credentials.
- Revoke the current session on logout and protect the session endpoint.
- Add Google sign-in and password-confirmed linking for existing accounts.
- Document configuration, verify the auth flows, and refresh Graphify.

## Capabilities

### New Capabilities

- `account-authentication` governs account access, federated identity, and session security.

### Modified Capabilities

None.

## Impact

Express auth routes, the shared MongoDB client, the existing users and authSessions collections, and auth configuration. Career profile APIs follow in Step 4.
