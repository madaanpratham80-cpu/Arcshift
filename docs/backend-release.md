# Backend release checks

## Local verification

Run the suite from the project directory with Node.js from `.nvmrc` and `mongod` on PATH. If MongoDB is installed elsewhere, set `MONGOD_BIN` to the executable path.

```sh
npm ci
npm run check:backend
```

The command builds TypeScript and runs HTTP, authentication, profile, roadmap, coaching, approval, and production-startup tests. The integration tests use temporary MongoDB data and local Google and Model Studio fixtures. They exercise competing approvals, stale proposals, recovery after restart, liveness, transaction readiness, and production cookie settings.

## Staging configuration

| Setting | What to verify |
| --- | --- |
| Runtime | Use the Node.js release in `.nvmrc`. Install dependencies, run `npm run build`, then start the compiled backend with `npm start`. |
| Host and port | Set `NODE_ENV=production`, use the host-provided `PORT`, and bind to `HOST=0.0.0.0` when required by the host. |
| Public origin | Set `APP_ORIGIN` to the exact HTTPS app origin. Terminate TLS at trusted ingress. Set `TRUST_PROXY_HOPS` only if every route has that verified proxy topology. |
| Database | Set `MONGODB_URI` and `MONGODB_DB` for the staging replica set or sharded cluster. Verify the application identity can create indexes and read and write the application collections. |
| Sessions | Generate `JWT_SIGNING_KEY` and keep it in the deployment's secret store. Reuse the environment's signing key across normal restarts. |
| Google | Configure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Register the exact HTTPS callback from the README. |
| AI provider | Select Groq or Alibaba Cloud Model Studio. Load the provider key from the deployment's private settings and verify that the selected model supports JSON Object Mode. |
| Probes | Use `/healthz` for process liveness and `/readyz` for traffic readiness. Production readiness checks MongoDB indexes and transaction support. |

[Express behind proxies](https://expressjs.com/en/guide/behind-proxies/) · [MongoDB transaction requirements](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/)

## Deployed smoke test

1. Open the staging origin over HTTPS. Verify `/healthz` and `/readyz` return 200.
2. Use a dedicated test account to register, log in, renew a session, and log out. Verify a separate Google sign-in and confirm production session cookies use `Secure` and `HttpOnly`.
3. Save a fictional profile, queue a roadmap, and poll its run to completion with the configured model provider.
4. Start a conversation. Report progress by naming a milestone in a direct statement. Open the proposal and check its rationale and before/after changes.
5. Confirm the active roadmap is still on the base version before approval. Apply the proposal, repeat approval, and verify both responses reference the same new version. Reopen the earlier roadmap and an exact transcript.
6. Restart the staging process and verify readiness, authenticated reads, and access to the stored conversation and plan. Check logs for startup and provider errors using request IDs.

## Rollback and recovery

Redeploy the last working backend build and keep the MongoDB data and deployment secrets available. Check startup indexes, liveness, readiness, login, and saved reads. Investigate delayed AI jobs using their run IDs. Eligible failed requests can be retried through the API, and abandoned worker jobs can be reclaimed when their leases expire.
