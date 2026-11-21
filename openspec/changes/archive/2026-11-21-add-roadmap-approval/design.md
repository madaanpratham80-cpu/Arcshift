# Design

## Context

Coaching and summary work already use durable jobs. Current roadmap state points to immutable versions and stores manual progress events.

## Goals / Non-Goals

Finish the backend with approval-based revisions and repeatable release checks. Hosting and real-provider smoke tests use the deployment's own configuration.

## Decisions

- Call Qwen for a separate, strictly validated revision only when the completed coaching reply requests it and a saved roadmap exists. Persist any preview with the reply and keep successful advice available if preparation fails.
- Bind each preview to the source user message, owner, roadmap version, and profile version. Give approved additions application-issued IDs and compare read-only before and after snapshots.
- Apply using a profile guard and active-roadmap check in the same transaction. Use the proposal ID to recover a repeated approval. Preserve immutable prior versions and append progress events for approved status changes.
- Require the exact milestone name or ID in a direct statement for an AI-proposed progress change. Keep completed definitions and evidence in history when an explicitly approved target change retires them.
- Use production startup and readiness checks to detect missing auth and unsupported MongoDB operations. Test the compiled service with synthetic accounts, a local replica set, and a Qwen-compatible fixture.

## Risks / Trade-offs

Local smoke tests exercise the release path. Live Google and Alibaba Cloud checks require staging credentials and the deployed origin.
