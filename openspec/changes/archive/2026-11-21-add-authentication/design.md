# Design

## Context

MongoDB already enforces unique canonical emails and Google subjects and expires old session records. The service will use the same database client from Step 2.

## Goals / Non-Goals

Provide a browser-facing identity boundary and a protected session endpoint. Career profiles, UI screens, and production identity-provider setup follow separately.

## Decisions

- Store bcrypt hashes with cost 12. Accept signup passwords of 15 or more characters up to bcrypt's 72-byte UTF-8 limit. Use a dummy hash for unknown password accounts and rate-limit password endpoints.
- Use a 15-minute access JWT and a seven-day session with an opaque refresh credential. Store only the refresh hash and replace it with a conditional update. Validate the active database session on each protected request.
- Use HttpOnly, SameSite cookies. HTTPS deployments use Secure host-only cookies. Check the configured Origin on auth POSTs. Use only loopback HTTP for local development.
- Validate Google state, nonce, PKCE and token claims on the backend. Use distinct JWT audiences for app access and the short-lived OAuth flow. Allow only a fixed same-origin return path. Create links only after a password check and an active-session match at callback.
- Account creation is an independent durable write. If issuing a new session fails afterward, the same account can sign in using its registered credentials. Unique indexes handle concurrent signups and Google linking.

## Risks / Trade-offs

Browser clients should coordinate refresh across tabs. A failed reuse attempt leaves cookies untouched so it cannot overwrite cookies from a successful rotation. Production Google OAuth needs a registered callback and deployment credentials.
