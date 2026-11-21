# Coaching Memory

## Purpose

Give the career coach continuity across sessions while preserving exact conversation history for the account owner.

## ADDED Requirements

### Requirement: Exact conversation history

The API SHALL let owners create, list, and reopen conversations. It SHALL retain original message text in sequence order and paginate history. History SHALL remain accessible independently of Qwen and summary availability.

#### Scenario: Reopen an older conversation

- **WHEN** an owner opens a conversation outside the active memory window
- **THEN** the API returns the saved original messages

### Requirement: Durable coaching turns

The API SHALL save each accepted user message and its queued AI turn atomically. It SHALL allow one pending turn per conversation, recover identical submissions by idempotency key, and publish at most one assistant reply. An eligible retry SHALL reuse the original user message and run.

#### Scenario: The provider fails

- **WHEN** Qwen cannot produce a valid reply
- **THEN** the user message remains in history, the run exposes the failure, and an eligible retry can complete the turn

#### Scenario: Retry after a newer turn

- **WHEN** a user retries a failed run after submitting a newer turn in the same conversation
- **THEN** the older run cannot publish a reply

### Requirement: Recent session memory

The worker SHALL refresh source-linked summaries after completed turns. Coaching SHALL consider at most the five most recently completed sessions for the signed-in owner, ordered by completed-turn time and ID. It SHALL omit missing or overlapping summaries without adding an older sixth session.

#### Scenario: Six sessions are available

- **WHEN** an owner starts a new coaching turn after completing six conversations
- **THEN** only the five latest sessions qualify as historical summaries
- **AND** all six original transcripts remain accessible

### Requirement: Bounded coaching context

The service SHALL provide bounded current-thread text, recent summaries and saved career state to Qwen. It SHALL validate response shape and save the reply as conversation content. Coaching turns and summary refreshes SHALL leave the active roadmap intact.

#### Scenario: A model response contains an unsupported plan change

- **WHEN** Qwen returns fields outside the coaching response contract
- **THEN** the backend does not apply a roadmap change or save an invalid reply
