# Proposal

## Why

The coach needs continuity across sessions, and users need the original text of earlier conversations when they return.

## What Changes

- Save conversations and exact user and assistant messages.
- Queue Qwen coaching turns and summary refreshes using resumable work.
- Supply up to five recent session summaries alongside the current conversation and saved career state.
- Verify archive access, history pagination, retries, summary ordering, and account isolation.

## Capabilities

### New Capabilities

- `coaching-memory` governs coaching turns, exact conversation history, and active session memory.

### Modified Capabilities

None.

## Impact

Conversation and AI run APIs, MongoDB conversation records, Qwen prompt contracts, and the in-process AI worker.
