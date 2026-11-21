# Design

## Context

The roadmap and coaching workers share a compatibility API for returning JSON. They validate model output before saving it in MongoDB transactions.

## Decisions

- Add Groq to the existing chat-completions transport and keep the existing Model Studio settings. Select one provider for each app process.
- Send Groq requests to its fixed HTTPS endpoint. Keep the provider key on the server. Apply the existing schema validation and retry rules.
- Use a single-node replica set bound to loopback for local app development. Give it a separate data directory and port from the existing MongoDB service.
