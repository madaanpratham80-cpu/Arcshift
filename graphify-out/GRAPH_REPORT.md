# Graph Report - graph-final  (2026-11-21)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 616 nodes · 1729 edges · 31 communities (29 shown, 2 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 40 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Arcshift React Workspace
- Roadmap Job Processing
- Protected AI Routes
- Backend and Browser Tests
- Google Identity and Sign-In
- Backend and Browser Tests
- Personal Activity Calendar
- Development Dependencies
- Backend and Browser Tests
- Roadmap Models and Revisions
- Cookie Sessions
- Application Dependencies
- Express and Public Routing
- Project Commands
- Coaching and Model Jobs
- Coaching and Model Jobs
- Backend and Browser Tests
- Frontend TypeScript
- Career Profile Endpoints
- Backend TypeScript
- Roadmap Approval
- Roadmap Models and Revisions
- Backend and Browser Tests
- Coaching and Model Jobs
- Roadmap Version Storage
- Backend and Browser Tests
- MongoDB Readiness
- AI Client Tests
- Vite Build Configuration
- Node Runtime Version

## God Nodes (most connected - your core abstractions)
1. `ApiError` - 58 edges
2. `mongodb` - 29 edges
3. `ErrorNotice()` - 26 edges
4. `expectJson()` - 25 edges
5. `createRoadmapRuns()` - 23 edges
6. `createSessionManager()` - 23 edges
7. `startServer()` - 23 edges
8. `createAuthRouter()` - 22 edges
9. `createCoachingRuns()` - 21 edges
10. `Loading()` - 20 edges

## Surprising Connections (you probably didn't know these)
- `current()` --calls--> `expectJson()`  [EXTRACTED]
  test/roadmap.integration.js → test/support/browser.js
- `currentProfile()` --calls--> `expectJson()`  [EXTRACTED]
  test/profile.integration.js → test/support/browser.js
- `onboardingComplete()` --calls--> `expectJson()`  [EXTRACTED]
  test/profile.integration.js → test/support/browser.js
- `invalidZone()` --calls--> `ApiError`  [EXTRACTED]
  api/activity.ts → api/http-errors.ts
- `createAdminRouter()` --calls--> `ApiError`  [EXTRACTED]
  api/admin/routes.ts → api/http-errors.ts

## Import Cycles
- None detected.

## Communities (31 total, 2 thin omitted)

### Community 0 - "Arcshift React Workspace"
Cohesion: 0.05
Nodes (109): lucide-react, react, react-router, @tanstack/react-query, RunProgress(), useRequestKey(), useRun(), Activity (+101 more)

### Community 1 - "Roadmap Job Processing"
Cohesion: 0.09
Nodes (55): aiUnavailable(), validatedJson(), claimLease(), currentLease(), LeasedJob, runExpired(), WorkSource, summarizeConversation() (+47 more)

### Community 2 - "Protected AI Routes"
Cohesion: 0.13
Nodes (29): createAiRunRouter(), runNotFound(), isObjectId(), createConversationRouter(), historySchema, invalidConversationInput(), listCursor(), listSchema (+21 more)

### Community 3 - "Backend and Browser Tests"
Cohesion: 0.10
Nodes (6): jose, browser(), signingKey, config, createBrowser(), createGoogleFixture()

### Community 4 - "Google Identity and Sign-In"
Cohesion: 0.11
Nodes (25): createGoogleFlow(), createGoogleProvider(), flowSchema, GOOGLE_FLOW_MS, GoogleFlow, googleKeys, GoogleProvider, Intent (+17 more)

### Community 5 - "Backend and Browser Tests"
Cohesion: 0.17
Nodes (9): mongodb, playwright, account(), currentProfile(), draft, onboardingComplete(), getLoopbackPort(), stopProcess() (+1 more)

### Community 6 - "Personal Activity Calendar"
Cohesion: 0.16
Nodes (13): calendar(), createActivityRouter(), invalidZone(), isoDay(), summarizeActivity(), createAdminRouter(), day(), Status (+5 more)

### Community 7 - "Development Dependencies"
Cohesion: 0.14
Nodes (18): devDependencies, playwright@1.65.1, @types/bcrypt@6.0.0, @types/express@5.0.6, @types/node@24.19.2, @types/react@19.3.0, @types/react-dom@19.3.0, typescript@5.9.3 (+10 more)

### Community 8 - "Backend and Browser Tests"
Cohesion: 0.18
Nodes (15): account(), conversation(), history(), background, current(), definition, preview(), profile() (+7 more)

### Community 9 - "Roadmap Models and Revisions"
Cohesion: 0.14
Nodes (16): Milestone, MilestoneDefinition, milestoneDefinitionSchema, milestoneStatus, MilestoneStatus, planSchema, RoadmapDraft, systemPrompt (+8 more)

### Community 10 - "Cookie Sessions"
Cohesion: 0.22
Nodes (16): Account, AUTH_ISSUER, createAuthCookies(), createSessionManager(), accessClaims(), authenticate(), issue(), logout() (+8 more)

### Community 11 - "Application Dependencies"
Cohesion: 0.12
Nodes (17): scripts, build, build:api, build:web, check:backend, db:local, dev, dev:web (+9 more)

### Community 12 - "Express and Public Routing"
Cohesion: 0.24
Nodes (10): startAiWorker(), createApp(), handleUnexpectedError(), readAuthConfig(), FieldErrors, sendApiError(), startServer(), closeDatabase() (+2 more)

### Community 13 - "Project Commands"
Cohesion: 0.12
Nodes (16): dependencies, bcrypt@6.0.0, cookie@1.1.1, express@5.3.0, express-rate-limit@8.7.5, jose@6.2.18, lucide-react@1.77.0, mongodb@7.9.0 (+8 more)

### Community 14 - "Coaching and Model Jobs"
Cohesion: 0.20
Nodes (13): AiClient, AiConfig, createAiClient(), completeJson(), errorSchema, invalidAiOutput(), Message, readAiConfig() (+5 more)

### Community 15 - "Coaching and Model Jobs"
Cohesion: 0.18
Nodes (12): publicProposalHint(), Conversation, ConversationCursor, ConversationStore, createConversationStore(), history(), list(), Message (+4 more)

### Community 16 - "Backend and Browser Tests"
Cohesion: 0.19
Nodes (12): startApi(), startApi(), startApi(), current(), draft, openAccount(), requests, runStatus() (+4 more)

### Community 17 - "Frontend TypeScript"
Cohesion: 0.14
Nodes (13): compilerOptions, jsx, lib, module, moduleResolution, noEmit, noUnusedLocals, noUnusedParameters (+5 more)

### Community 18 - "Career Profile Endpoints"
Cohesion: 0.24
Nodes (10): CAREER_PROFILES_COLLECTION, constraintsSchema, createProfileRouter(), profileSchema, profileText, skillsSchema, careerProfiles(), profileVersionConflict() (+2 more)

### Community 19 - "Backend TypeScript"
Cohesion: 0.17
Nodes (11): compilerOptions, erasableSyntaxOnly, module, noEmitOnError, outDir, rewriteRelativeImportExtensions, rootDir, strict (+3 more)

### Community 20 - "Roadmap Approval"
Cohesion: 0.29
Nodes (9): createRoadmapProposals(), apply(), get(), Proposal, ProposalInput, proposalStale(), RoadmapProposals, PreparedRevision (+1 more)

### Community 21 - "Roadmap Models and Revisions"
Cohesion: 0.25
Nodes (10): compileRevision(), directReports, groundedStatus(), id, namesMilestone(), normalize(), phaseRef, plain (+2 more)

### Community 22 - "Backend and Browser Tests"
Cohesion: 0.25
Nodes (6): coachRequests, completed(), send(), status(), waitSummary(), waitUntil()

### Community 23 - "Coaching and Model Jobs"
Cohesion: 0.22
Nodes (9): boundedTranscript(), clip(), coachPrompt, replySchema, summaryPrompt, summarySchema, CareerProfile, CareerProfileFields (+1 more)

### Community 24 - "Roadmap Version Storage"
Cohesion: 0.36
Nodes (8): createRoadmapStore(), activeFor(), advanceRoadmap(), publishInitial(), publishRevision(), updateMilestone(), readReceipt(), versionFor()

### Community 25 - "Backend and Browser Tests"
Cohesion: 0.32
Nodes (4): connectOrStart(), directClient(), startLocalMongo(), storagePath

### Community 26 - "MongoDB Readiness"
Cohesion: 0.33
Nodes (4): createMongoDatabase(), checkReadiness(), probeMongo(), initializeMongoIndexes()

### Community 27 - "AI Client Tests"
Cohesion: 0.29
Nodes (3): groq, messages, qwen

### Community 28 - "Vite Build Configuration"
Cohesion: 0.40
Nodes (4): vite@8.3.8, @vitejs/plugin-react@6.3.0, vite, @vitejs/plugin-react

## Knowledge Gaps
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `mongodb` connect `Backend and Browser Tests` to `Roadmap Job Processing`, `Protected AI Routes`, `Backend and Browser Tests`, `Google Identity and Sign-In`, `Personal Activity Calendar`, `Development Dependencies`, `Backend and Browser Tests`, `Roadmap Models and Revisions`, `Cookie Sessions`, `Project Commands`, `Coaching and Model Jobs`, `Backend and Browser Tests`, `Career Profile Endpoints`, `Roadmap Approval`, `Roadmap Models and Revisions`, `Backend and Browser Tests`, `Backend and Browser Tests`?**
  _High betweenness centrality (0.314) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `createRoadmapRuns()` (e.g. with `claimWork()` and `enqueue()`) actually correct?**
  _`createRoadmapRuns()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **Should `Arcshift React Workspace` be split into smaller, more focused modules?**
  _Cohesion score 0.051639833035181874 - nodes in this community are weakly interconnected._
- **Why does `@tanstack/react-query` connect `Arcshift React Workspace` to `Project Commands`, `Development Dependencies`?**
  _High betweenness centrality (0.102) - this node is a cross-community bridge._
- **Should `Roadmap Job Processing` be split into smaller, more focused modules?**
  _Cohesion score 0.09209039548022599 - nodes in this community are weakly interconnected._
- **Why does `express` connect `Express and Public Routing` to `Protected AI Routes`, `Backend and Browser Tests`, `Google Identity and Sign-In`, `Personal Activity Calendar`, `Development Dependencies`, `Cookie Sessions`, `Project Commands`, `Career Profile Endpoints`?**
  _High betweenness centrality (0.092) - this node is a cross-community bridge._
- **Should `Protected AI Routes` be split into smaller, more focused modules?**
  _Cohesion score 0.1265597147950089 - nodes in this community are weakly interconnected._