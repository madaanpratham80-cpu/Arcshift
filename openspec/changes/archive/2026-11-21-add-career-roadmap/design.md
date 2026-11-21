# Design

## Context

The API already stores one versioned career profile per owner and verifies revocable JWT sessions.

## Goals / Non-Goals

Deliver first-plan generation, manual progress, and immutable version history. Chat, active memory, and proposal approval follow in later steps.

## Decisions

- Keep a current roadmap pointer, immutable versions, progress events, and idempotency receipts in separate collections.
- Persist Qwen jobs in MongoDB. Atomically claim eligible jobs and prevent expired attempts from publishing. Bound provider calls and draft validation retries.
- Publish the first roadmap and successful run in a transaction that guards the input profile version. Provider requests run outside that transaction.
- Commit milestone changes, history, event, and receipt in one transaction. Store a receipt for no-op saves so identical retries retain their original outcome.
- Accept HTTP and HTTPS evidence links as text. Only the saved career profile fields supply model context.

## Risks / Trade-offs

Roadmap writes require a MongoDB replica set or sharded deployment. Local verification uses a Qwen-compatible fixture. Live Alibaba Cloud verification depends on the project's Model Studio settings.
