# Design

## Context

The Express backend already supports session cookies, profile and roadmap versions, durable AI runs, exact transcripts, and proposal approval.

## Decisions

- Build React with Vite and use React Router for durable browser URLs. Serve the built output from Express on the production origin.
- Use a shared cookie-aware API client and a query cache for loading, pagination, and recoverable AI job polling. Keep credentials in the backend cookies.
- Keep registration, onboarding, dashboard, coach, history, profile settings, and proposal review as separate screens with responsive navigation.
- Preserve request keys across retry of a lost submission. Use server versions for profile and roadmap writes.
- Expose proposal references in transcript responses through an owner-scoped lookup so earlier assistant messages can reopen their review.

## Risks / Trade-offs

Local browser tests use an isolated database and provider fixtures. Google and Model Studio still need the staging credentials for live checks.
