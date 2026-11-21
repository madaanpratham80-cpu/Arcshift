# Design

## Context

Authentication already validates the access JWT and active database session. The confirmed app needs one current profile per account.

## Goals / Non-Goals

Deliver a versioned read and replacement API and make the session report whether the user has finished onboarding. The onboarding UI and AI roadmap generation are later steps.

## Decisions

- Use a unique index on `careerProfiles.userId` and derive the owner from the session.
- Accept background, self-reported skills, target role, hours per week, and optional budget and notes. Allow an empty skills list and zero weekly hours to represent the user's actual situation.
- Use `expectedVersion: 0` for creation. Insert under the unique owner index. Use one filtered MongoDB update for existing profiles, matching the account and expected version and incrementing the version atomically.
- Reuse the authentication, request-origin, and database readiness checks. Validation issues use the shared error envelope and may include field-level messages.
- Compute onboarding status from profile existence. This keeps a successful first save and the session's onboarding status in sync without a second account update.

## Risks / Trade-offs

Clients must reload after a version conflict and decide whether to reapply their unsaved edits. The profile holds user-provided context and will be treated as self-reported when roadmap generation is added.
