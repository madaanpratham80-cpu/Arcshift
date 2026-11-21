# Design

## Context

Roadmap generation already uses MongoDB leases, transaction fencing, and a server-side Qwen adapter.

## Goals / Non-Goals

Deliver durable coaching turns and exact history with a bounded session-memory window. Roadmap change preview and approval follow in Step 7.

## Decisions

- Store messages as separate immutable records and session metadata in a conversation document. Sequence numbers order the transcript. Cursor pagination keeps reads bounded.
- Put coaching and summary jobs in a separate collection so existing roadmap job uniqueness and records remain compatible. Share lease handling and the in-process worker across the job sources.
- Transactionally enqueue the user message and turn. Transactionally publish the reply, update session recency, and enqueue summary refresh work. Store failures separately from the transcript.
- Summarize completed messages in bounded chunks, carrying forward valid prior facts and their source sequence numbers. A fresher reply triggers another refresh when needed.
- Select the latest five completed sessions before filtering unavailable summaries. Use current-thread text separately and omit an overlapping summary from that thread. Send a bounded profile and roadmap projection without evidence URLs.

## Risks / Trade-offs

Summary work is asynchronous. A failed refresh can temporarily reduce the available memory, while the original messages remain readable.
