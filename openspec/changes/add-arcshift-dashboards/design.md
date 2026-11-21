# Design

Use a light member workspace for roadmap status and a separate dark admin dashboard for aggregate system activity. Derive values from stored roadmaps and jobs.

The admin API accepts a live Google-authenticated session for the configured Gmail address. On first access the server binds its Google subject in a single MongoDB record. Password sessions and other Google subjects receive a forbidden response. Google redirects return to admin only when the signed OAuth flow contains that destination.

Express serves the SPA with HTTP 404 for unknown browser paths and preserves structured API and asset errors. Terms copy is marked as a draft pending owner review.
