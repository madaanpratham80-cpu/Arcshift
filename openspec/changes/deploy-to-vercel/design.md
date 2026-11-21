# Design

- Move backend source files out of Vercel's reserved `api/` directory. Keep Express routes and the local server's compiled entrypoint.
- Bundle the React HTML with the Express function. Serve the fingerprinted assets from Vercel's CDN, with Express handling UI and JSON 404 responses.
- Register AI work with Vercel's request lifetime after job creation and retries. Authenticated polling can reclaim eligible work after an interruption. Conversation history requests can resume pending summaries. MongoDB remains responsible for atomic leases and durable results.
- Require a hosted transaction-capable MongoDB deployment and a fixed HTTPS application origin. Configure Google sign-in against the callback at that origin.
