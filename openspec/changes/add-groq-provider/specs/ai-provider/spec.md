# AI Provider

## ADDED Requirements

### Requirement: Configurable JSON model provider

The API SHALL support Groq and Alibaba Cloud Model Studio as alternatives for roadmap generation, coaching, and proposal preparation. When both providers have settings, the server SHALL require explicit provider selection. The server SHALL use the selected provider's authenticated chat-completions endpoint and validate returned JSON before using it.

#### Scenario: Use Groq for career guidance

- **WHEN** the app starts with valid Groq credentials and a transaction-capable MongoDB connection
- **THEN** it runs the existing roadmap generation and coaching jobs through the Groq JSON endpoint

#### Scenario: Both providers are present

- **WHEN** both providers have settings but no provider is selected
- **THEN** the app reports a configuration error before submitting any model requests
