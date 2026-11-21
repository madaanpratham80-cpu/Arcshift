# Proposal

## Why

The project needs a live model endpoint that works with the available Groq credentials.

## What Changes

- Support Groq and Alibaba Cloud Model Studio through the existing JSON model client and durable job workers.
- Document provider configuration and provide an isolated local MongoDB replica set for transaction-backed features.
- Verify live Groq responses with synthetic profile and coaching data.

## Capabilities

### New Capabilities

- `ai-provider` governs provider selection and the JSON completion contract.

### Modified Capabilities

None.

## Impact

Backend model transport, local configuration, and development startup.
