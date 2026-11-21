# Arcshift application guide

A career coaching app that turns a target role into a saved roadmap and adapts it as the user makes progress. The React workspace connects account sign-in, career onboarding, versioned roadmaps, coaching history, and proposal approval to one Express API.

## Run the app

Use the Node.js version in `.nvmrc`. Start a local MongoDB instance or use MongoDB Atlas. Standalone MongoDB works for local account and profile checks. Roadmap and coaching writes require a MongoDB replica set or a sharded deployment.

```sh
npm ci
test -f .env || cp .env.example .env
node -p "require('node:crypto').randomBytes(32).toString('base64url')"
```

In `.env`, set `MONGODB_URI` to your connection string and `MONGODB_DB` to an application database. Use 1–63 letters, numbers, underscores, or hyphens for the database name. Keep .env credentials private. The MongoDB account needs permission to create indexes in the application database. Save the generated value as `JWT_SIGNING_KEY` and set `APP_ORIGIN` to the exact browser origin, such as `http://127.0.0.1:3000`. Run the compiled app after configuring `.env`.

```sh
npm run build
npm start
```

Open [Arcshift](http://127.0.0.1:3000). Create an account and save your career profile. Roadmap generation and AI coaching require a configured provider under [Roadmap generation and progress](#roadmap-generation-and-progress). Configure Google credentials to enable the Google sign-in button.

For frontend development, set `APP_ORIGIN=http://127.0.0.1:5173` and adjust any configured Google callback to match that origin. Run `npm run dev` and `npm run dev:web` in separate terminals and open [the Vite dev server](http://127.0.0.1:5173). Vite proxies `/api` to the Express server. Set `CAREER_API_ORIGIN` in the Vite process if the API uses a different port. If Vite stalls on startup, run `RAYON_NUM_THREADS=2 npm run dev:web`. This setting was verified on the development Mac.

For a liveness-only run, omit the MongoDB and auth settings. To use MongoDB without enabling authentication, omit the auth settings and keep the MongoDB values.

```sh
curl -i http://127.0.0.1:3000/healthz
curl -i http://127.0.0.1:3000/readyz
```

- `/healthz` returns 200 when the HTTP process responds.
- `/readyz` returns 200 after MongoDB responds and startup indexes are ready. Production and AI-enabled instances also require MongoDB transaction support.

The API binds to `127.0.0.1:3000` by default. Set `HOST=0.0.0.0` when a deployment needs to expose the API process to its network.

`npm test` verifies the HTTP and Google token contracts. `npm run test:mongodb`, `npm run test:auth`, `npm run test:profile`, `npm run test:roadmap`, `npm run test:coaching`, and `npm run test:revision` verify integration flows against isolated MongoDB processes. They require `mongod` on PATH or an explicit `MONGOD_BIN` path. Auth tests use synthetic accounts and signed Google test tokens. Roadmap and coaching tests start their own replica sets and Qwen-compatible fixtures.

`npm run test:web` verifies the compiled app in a browser with an isolated MongoDB replica set and Qwen-compatible fixture. Install Playwright Chromium once with `npx playwright install chromium` or run `CAREER_BROWSER_CHANNEL=chrome npm run test:web` to use installed Google Chrome. The browser suite exercises password sign-in, onboarding, roadmap generation and history, session refresh, chat resume, approval, and mobile navigation.

## Authentication

All auth routes are under `/api/auth`. Send the configured `Origin` and browser cookies with POSTs. Registration and password login accept `{ "email": "person@example.test", "password": "..." }`. Signup passwords must have at least 15 characters and fit within bcrypt’s 72-byte UTF-8 limit. Successful registration, login, and refresh return `data.user` with `id`, `email`, and `signInMethods`.

| Method and path | Behavior |
| --- | --- |
| `POST /api/auth/register` | Create a password account and begin a session. |
| `POST /api/auth/login` | Verify the password and begin a session. |
| `GET /api/auth/session` | Return the signed-in account and `data.onboardingComplete`, or `401 SIGN_IN_REQUIRED`. |
| `POST /api/auth/refresh` | Rotate the current refresh credential and issue a new access JWT. |
| `POST /api/auth/logout` | Revoke this browser session and clear its cookies. |
| `GET /api/auth/google/start` | Start the Google authorization redirect. With `Accept: application/json`, return `data.authorizationUrl` for the app to open. |
| `GET /api/auth/google/callback` | Validate the Google reply and redirect to the same-origin app root. |
| `POST /api/auth/google/link` | Confirm the current session’s password and return a Google authorization URL. |

Access JWTs last up to 15 minutes. Refresh credentials rotate within a seven-day session. The browser should coordinate refresh calls across tabs. If a concurrent refresh returns 401, check the current session again before navigating to login. If signup finishes without usable cookies, sign in with the same email and password.

Set `NODE_ENV=production` for deployment. Production requires an HTTPS `APP_ORIGIN` and uses `Secure`, host-only cookies. Password attempts are rate-limited per client IP per Node process. Set `TRUST_PROXY_HOPS` only when requests always traverse that many trusted proxies and ingress rewrites forwarding headers.

### Google setup

Create a Google OAuth web client. Register `<APP_ORIGIN>/api/auth/google/callback` as an authorized redirect URI and set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. If provided explicitly, `GOOGLE_REDIRECT_URI` must equal that callback. Use application-specific credentials for each environment. [Google OpenID Connect setup](https://developers.google.com/identity/openid-connect/openid-connect)

Visit `/api/auth/google/start` to sign in. The callback redirects to `/?auth=google_signed_in` on success. A matching local email produces `google_link_required`. Sign in with the local password, POST it to `/api/auth/google/link`, then navigate to the returned `data.authorizationUrl`. The callback reports `google_linked`, `google_link_conflict`, or `google_failed`. The frontend routes the user to the workspace, Settings, or the sign-in screen based on the outcome.

## Career activity

The roadmap dashboard shows the last 365 days in the browser’s time zone. The heat map counts your initial profile save, saved roadmap versions, and messages you send to the coach. The current streak can include yesterday while today is still open. Use the arrow keys to explore the calendar. Arcshift saves one streak summary per account in MongoDB and refreshes it whenever the activity calendar loads.

## Admin and public pages

Open [Arcshift admin](http://127.0.0.1:3000/admin) and sign in with Google. Set `ARCSHIFT_ADMIN_EMAIL` in the private `.env` to the designated Gmail address. Admin access requires a new Google sign-in, and the first successful admin request binds the immutable Google account identifier in MongoDB. Admin reads return aggregate totals and activity. Google account linking alone leaves a password session without admin access.

The public `/terms` page contains draft Terms and Conditions for owner review. Missing browser pages return HTTP 404 and show the Arcshift recovery page.

## Career profile and onboarding

Both endpoints use the account from the active session. `GET /api/auth/session` reports `data.onboardingComplete: true` once that account has a saved profile.

| Method and path | Behavior |
| --- | --- |
| `GET /api/profile` | Return `data.profile`. New accounts receive `null`. |
| `PUT /api/profile` | Save all editable profile fields. Send `expectedVersion: 0` for a first save and the retrieved profile version for edits. Include the configured `Origin`. |

Example first save:

```json
{
  "expectedVersion": 0,
  "background": "React developer with two course projects.",
  "skills": ["JavaScript", "React", "Git"],
  "targetRole": "Backend developer",
  "hoursPerWeek": 6.5,
  "constraints": {
    "budget": "Prefer free resources",
    "notes": "Available on weekends"
  }
}
```

Background and target role are required. Skills can be empty. Duplicate skill labels are removed while preserving the first spelling and order. Weekly hours accept whole or fractional values from 0 to 168. Budget and notes are optional. Omit them or send an empty constraints object to clear them during a replacement.

First save returns HTTP 201 and version 1. An edit returns HTTP 200 and the next version. Both return `data.profile` with the canonical fields and server timestamps `createdAt` and `updatedAt`. Invalid input returns `VALIDATION_FAILED`, with field messages when available. If the API returns `409 PROFILE_VERSION_CONFLICT`, reload the profile and reconcile the draft with the last saved version.

## Roadmap generation and progress

Use a transaction-capable MongoDB deployment. On macOS or Linux, `npm run db:local` starts the project's single-node replica set in `.local/mongo` on port 27018. Run it before `npm start` and set `MONGODB_URI=mongodb://127.0.0.1:27018/?replicaSet=careerAgentLocal` in `.env`. A MongoDB Atlas or existing replica set connection can also be used.

For Groq, set `AI_PROVIDER=groq`, `GROQ_API_KEY`, and optionally `GROQ_MODEL` in the private `.env`. The default model is `qwen/qwen3.8-27b` hosted by Groq. Configure `GROQ_TIMEOUT_MS` to override the 20-second default. The app uses Groq's fixed HTTPS endpoint and JSON Object Mode. [Groq structured output docs](https://console.groq.com/docs/structured-outputs)

For Alibaba Cloud Model Studio, set `AI_PROVIDER=qwen`, `QWEN_API_KEY`, `QWEN_BASE_URL`, and `QWEN_MODEL` in `.env`. Use the compatible API base ending in `/v1` for your Model Studio workspace and a model that supports JSON object output. `QWEN_ENABLE_THINKING` is optional. Set it to `false` only when your model supports disabling thinking and needs it for structured output. `QWEN_TIMEOUT_MS` defaults to 20,000 ms per call. [Model Studio compatible API](https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope) · [Structured output settings](https://docs.modelstudio.console.alibabacloud.com/en/model-studio/qwen-structured-output)

Set `AI_PROVIDER` when both providers have settings.

The app keeps the generation job in MongoDB. Save a profile, enqueue a run, then poll the run resource until it succeeds or fails. Dashboard reads include the latest generation run while the profile has no saved roadmap.

| Method and path | Behavior |
| --- | --- |
| `GET /api/roadmap` | Return `data.roadmap` and `data.run`. The run is available while the initial roadmap is absent. |
| `POST /api/roadmap/generate` | Queue initial generation using `{ "expectedProfileVersion": 1 }`. Send an `Idempotency-Key`. Returns HTTP 202 with `data.runId`. |
| `GET /api/ai/runs/:id` | Return the owner's run. Statuses are `queued`, `running`, `succeeded`, and `failed`. |
| `POST /api/ai/runs/:id/retry` | Requeue an eligible failed run and return the same run ID. |
| `PATCH /api/roadmap/milestones/:id` | Save milestone progress with its expected roadmap version and an `Idempotency-Key`. |
| `GET /api/roadmap/versions` | Return version summaries newest first. Use `limit` and the returned `nextCursor` as `cursor`. |
| `GET /api/roadmap/versions/:version` | Read a saved roadmap version and its original milestone state. |

Example progress save:

```json
{
  "expectedRoadmapVersion": 1,
  "status": "completed",
  "evidenceUrl": "https://example.test/my-work"
}
```

Statuses are `todo`, `in_progress`, and `completed`. Omit `evidenceUrl` to retain it or pass `null` to clear it. Evidence links are stored without fetching them. All mutations use the configured `Origin`. Replay the same key and body after a connection failure. A stale profile or roadmap returns HTTP 409, and the client can reload before retrying with the new version. If generation is unavailable, the saved profile and existing roadmap remain readable.

## Coaching, history, and memory

Coaching uses the same model provider and resumable worker as roadmap generation. Save a profile before sending a message. The first save of a coaching turn records the exact user text, including line breaks and spacing, with its queued run before calling the provider.

| Method and path | Behavior |
| --- | --- |
| `POST /api/conversations` | Create a conversation. The optional JSON `title` can name it. An untitled conversation uses a short excerpt of its first message. |
| `GET /api/conversations` | List conversations newest by activity. Use `limit` and the returned `nextCursor` as `cursor`. |
| `GET /api/conversations/:id/messages` | Return conversation metadata and exact messages. Each page displays in sequence order. Pass `nextCursor` as `cursor` to load earlier messages. `GET /api/conversations/:id` is equivalent. |
| `POST /api/conversations/:id/messages` | Send `{ "text": "Help me plan my next milestone." }`, the configured `Origin`, and an `Idempotency-Key`. Returns 202 with conversation, run, and user message IDs. |
| `GET /api/ai/runs/:id` | Poll a coaching turn as well as a roadmap run. A completed coaching run returns the assistant message ID. |
| `POST /api/ai/runs/:id/retry` | Retry an eligible failure using the same run and original user message. |

Each conversation has at most one pending reply. Conversation metadata provides `pendingRunId` and `lastRunId` to recover a reply or failure after reload. Once a newer turn is accepted, a failed older turn returns `RUN_SUPERSEDED` when retried. History reads continue to work during a provider outage.

The coach receives a bounded portion of the current thread and the saved profile and roadmap, without milestone evidence URLs. The worker selects the five most recently completed conversations for the account. It uses available summaries from that set and skips any summary overlapping current-thread text. Older exact messages remain in History. Summaries refresh in the background and store references to original messages. Coaching can generate a preview for review. Only approving it updates the active roadmap. [Model Studio conversation context](https://www.alibabacloud.com/help/en/model-studio/multi-round-conversation)

## Roadmap proposals and approvals

When a coaching reply requests a revision, the backend can make a separate model call and validate a preview. The completed run's `data.result.proposalAvailability` is `available`, `unavailable`, or `not_requested`. An available preview includes `data.result.proposalId`. Assistant messages expose the same proposal status and ID when read through conversation history. If preparation fails, the completed reply is still in conversation history.

| Method and path | Behavior |
| --- | --- |
| `GET /api/roadmap/proposals/:id` | Return the owner's proposal, rationale, base versions, before/after diff, and approval status. |
| `POST /api/roadmap/proposals/:id/apply` | Approve the whole preview. Send the configured `Origin`. Returns `data.roadmap` at the applied version. |

Approval checks the profile and active roadmap versions. A stale proposal returns `409 PROPOSAL_STALE`. Repeating a successful approval returns the original applied version. A milestone status suggestion must cite the latest user's direct progress report naming the milestone. Completed items and saved evidence remain visible in earlier versions. A target change uses the saved profile role.

## Backend release

Run `npm run check:backend` for the compile, regression, and production smoke suites. See the [backend release runbook](backend-release.md) for environment settings, deployed verification, and rollback.

## MongoDB startup indexes

| Collection | Field | Constraint |
| --- | --- | --- |
| `users` | `emailCanonical` | Unique |
| `users` | `googleSub` | Unique for string values |
| `authSessions` | `expiresAt` | TTL cleanup based on the stored expiry date |
| `careerProfiles` | `userId` | Unique |
| `roadmaps` | `userId` | One active roadmap per account |
| `roadmapVersions` | `roadmapId` and `version` | Unique snapshots |
| `roadmapProposals` | `runId` | One preview per coaching run |
| `roadmapOperations` | `userId` and `key` | Unique progress request receipts |
| `aiRuns` | Owner, kind, request key and active status | One active initial run per account with key-based replay |
| `conversations` | Owner and activity or completed-turn time | History pagination and recent memory |
| `messages` | Conversation ID and sequence | Unique transcript order |
| `coachRuns` | Owner, conversation, kind, request key and active status | Durable replies and summary refreshes |

If readiness returns 503, check the URI, database permissions, and server logs. Conflicting index definitions or duplicate values must be resolved before startup indexing can succeed.

## Specifications and code graph

See the [system architecture](AI%20Career%20Agent%20-%20System%20Architecture.pdf), [build and copy guide](AI%20Career%20Agent%20-%20Build%20and%20Copy%20Guide.md), and [Graphify report](../graphify-out/GRAPH_REPORT.md). OpenSpec requirements and change history live under `openspec/`. Graphify indexes the Express and React code and tests using local structural extraction.

```sh
graphify extract . --code-only --out .
graphify cluster-only . --no-label
graphify query "How does the app present a roadmap proposal?" --seed web/src/proposal.tsx
```

## Build order

1. Express startup, liveness, and the error contract.
2. MongoDB connection, index setup, and dependency readiness.
3. Email/password and Google authentication with JWT sessions.
4. Career profile and onboarding API.
5. Roadmap generation, milestone progress, and version history.
6. Coaching, exact conversation history, and recent summaries.
7. Roadmap revision approval and backend deployment checks.
8. React frontend and browser verification.
