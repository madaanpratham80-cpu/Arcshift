# Arcshift

Arcshift turns a career goal into a roadmap you can work through at your own pace. Track milestones and evidence, ask the AI coach for guidance, and review proposed changes before they update your plan.

## What you can do

- Save a career profile with your skills, target role, available hours, and constraints.
- Generate a roadmap, update milestones, and reopen earlier versions of your plan.
- Continue coaching conversations, revisit their history, and approve proposed roadmap revisions.
- Track active days and streaks with a 365-day calendar in your time zone.
- View aggregate workspace and AI job metrics from the owner-only admin dashboard.

Arcshift uses React, TypeScript, and Vite for the web app, Express for the API, and MongoDB for accounts, roadmap versions, coaching history, durable AI jobs, and streak summaries. Groq and Alibaba Cloud Model Studio are supported providers.

## Run locally

You’ll need the Node.js version in [`.nvmrc`](.nvmrc) and a MongoDB replica set. On macOS or Linux, the project can start a local single-node replica set if `mongod` is on your PATH.

```sh
git clone https://github.com/madaanpratham80-cpu/Arcshift.git
cd Arcshift
npm ci
test -f .env || cp .env.example .env
npm run db:local
```

Set these values in your private `.env`.

| Setting | Value |
| --- | --- |
| `APP_ORIGIN` | `http://127.0.0.1:3000` for the default local setup |
| `JWT_SIGNING_KEY` | Generate with `node -p "require('node:crypto').randomBytes(32).toString('base64url')"` |
| `MONGODB_URI` | `mongodb://127.0.0.1:27018/?replicaSet=careerAgentLocal` for the project replica set, or your own replica set URI |
| `MONGODB_DB` | A dedicated database name, such as `arcshift` |

For **roadmap generation and coaching**, set `AI_PROVIDER=groq`, `GROQ_API_KEY`, and `GROQ_MODEL=openai/gpt-oss-120b` for Groq. The [application guide](docs/application-guide.md#roadmap-generation-and-progress) covers other models and Model Studio.

For **Google sign-in**, use a Google OAuth Web application client. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env` and register `http://127.0.0.1:3000/api/auth/google/callback` as the authorized redirect URI. To enable `/admin`, set `ARCSHIFT_ADMIN_EMAIL` to the one verified Gmail account that should have access.

```sh
npm run build
npm start
```

Open [Arcshift](http://127.0.0.1:3000) and sign in to create your career profile. Use [`/readyz`](http://127.0.0.1:3000/readyz) to check database readiness.

## Verify changes

```sh
npm run check:backend
npx playwright install chromium
npm run test:web
```

Integration and browser tests start isolated databases and use provider fixtures. You can use an installed Chrome browser with `CAREER_BROWSER_CHANNEL=chrome npm run test:web`.

## Project documentation

- [Application guide and API contracts](docs/application-guide.md)
- [System architecture](docs/AI%20Career%20Agent%20-%20System%20Architecture.pdf)
- [Backend release runbook](docs/backend-release.md)
- [OpenSpec requirements](openspec/specs) and [change history](openspec/changes)
- [Graphify report](graphify-out/GRAPH_REPORT.md)
