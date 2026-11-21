# Graph Report - Arcshift  (2026-11-22)

## Corpus Check
- 146 files · ~56,142 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 9 file(s) not represented in the graph (top: (none) 5, .css 3, .example 1)

## Summary
- 1146 nodes · 2207 edges · 102 communities (77 shown, 25 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 41 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `05eaab61`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- roadmap.tsx
- auth/routes.ts
- roadmap/routes.ts
- auth.integration.js
- roadmap/runs.ts
- profile.integration.js
- revision.ts
- package.json
- revision.integration.js
- coaching/runs.ts
- vercel-server.js
- scripts
- runtime.ts
- dependencies
- sessions.ts
- ApiError
- roadmap.integration.js
- compilerOptions
- deploy-to-vercel/design.md
- compilerOptions
- Arcshift application guide
- ADDED Requirements
- coaching.integration.js
- ADDED Requirements
- ADDED Requirements
- ref_node_fs
- Requirement: Google authentication
- ai-client.test.js
- vite
- Requirements
- engines
- Requirements
- ADDED Requirements
- ADDED Requirements
- Requirements
- Requirements
- ADDED Requirements
- ADDED Requirements
- Requirements
- createSessionManager
- createRoadmapStore
- Backend release checks
- AI Career Agent Build and Copy Guide
- ADDED Requirements
- ADDED Requirements
- ADDED Requirements
- backend-http Specification
- index.js
- Proposal
- Proposal
- ADDED Requirements
- Proposal
- Proposal
- Proposal
- Proposal
- Proposal
- Proposal
- Proposal
- Proposal
- ADDED Requirements
- Proposal
- backend-release Specification
- vercel.json
- createMongoDatabase
- 5. Qwen prompt drafts and response contracts
- Proposal
- 6. Engineering handoff text
- 7. Trust, support, and launch drafts
- Requirement: Configurable JSON model provider
- Design
- Design
- Design
- Design
- Design
- Design
- Design
- Arcshift
- Design
- 3. Dashboard, coaching, history, and settings
- Design
- Tasks
- Tasks
- Tasks
- Tasks
- Tasks
- Tasks
- Tasks
- Tasks
- Tasks
- Tasks
- Tasks
- Tasks
- add-arcshift-dashboards/design.md
- add-career-activity/design.md
- add-react-workspace/README.md
- 2026-11-21-add-authentication/README.md
- 2026-11-21-add-career-profile/README.md
- 2026-11-21-add-career-roadmap/README.md
- 2026-11-21-add-coaching-memory/README.md
- 2026-11-21-add-mongodb-readiness/README.md
- 2026-11-21-add-roadmap-approval/README.md
- 2026-11-21-bootstrap-backend/README.md

## God Nodes (most connected - your core abstractions)
1. `ApiError` - 58 edges
2. `mongodb` - 29 edges
3. `ErrorNotice()` - 26 edges
4. `expectJson()` - 25 edges
5. `createSessionManager()` - 23 edges
6. `createRoadmapRuns()` - 23 edges
7. `createRuntime()` - 23 edges
8. `createAuthRouter()` - 22 edges
9. `createCoachingRuns()` - 21 edges
10. `Loading()` - 20 edges

## Surprising Connections (you probably didn't know these)
- `MongoDB startup indexes` --references--> `careerProfiles()`  [INFERRED]
  docs/application-guide.md → backend/profile/store.ts
- `conversation()` --calls--> `expectJson()`  [EXTRACTED]
  test/coaching.integration.js → test/support/browser.js
- `history()` --calls--> `expectJson()`  [EXTRACTED]
  test/coaching.integration.js → test/support/browser.js
- `currentProfile()` --calls--> `expectJson()`  [EXTRACTED]
  test/profile.integration.js → test/support/browser.js
- `onboardingComplete()` --calls--> `expectJson()`  [EXTRACTED]
  test/profile.integration.js → test/support/browser.js

## Import Cycles
- None detected.

## Communities (102 total, 25 thin omitted)

### Community 0 - "roadmap.tsx"
Cohesion: 0.05
Nodes (109): lucide-react, react, react-router, @tanstack/react-query, RunProgress(), useRequestKey(), useRun(), Activity (+101 more)

### Community 1 - "auth/routes.ts"
Cohesion: 0.09
Nodes (28): GoogleConfig, createGoogleFlow(), createGoogleProvider(), flowSchema, GOOGLE_FLOW_MS, GoogleFlow, googleKeys, GoogleProvider (+20 more)

### Community 2 - "roadmap/routes.ts"
Cohesion: 0.19
Nodes (20): createAiRunRouter(), runNotFound(), isObjectId(), createConversationRouter(), historySchema, invalidConversationInput(), listCursor(), listSchema (+12 more)

### Community 3 - "auth.integration.js"
Cohesion: 0.11
Nodes (4): jose, signingKey, config, createGoogleFixture()

### Community 4 - "roadmap/runs.ts"
Cohesion: 0.15
Nodes (24): aiUnavailable(), completeJson(), claimLease(), generateRoadmap(), createRoadmapRuns(), checkSource(), claim(), claimWork() (+16 more)

### Community 5 - "profile.integration.js"
Cohesion: 0.16
Nodes (8): playwright, html, currentProfile(), draft, onboardingComplete(), getLoopbackPort(), stopProcess(), milestone

### Community 6 - "revision.ts"
Cohesion: 0.06
Nodes (53): AiClient, AiConfig, errorSchema, invalidAiOutput(), Message, readAiConfig(), readQwenConfig(), readTimeout() (+45 more)

### Community 7 - "package.json"
Cohesion: 0.14
Nodes (18): devDependencies, playwright@1.65.1, @types/bcrypt@6.0.0, @types/express@5.0.6, @types/node@24.19.2, @types/react@19.3.0, @types/react-dom@19.3.0, typescript@5.9.3 (+10 more)

### Community 8 - "revision.integration.js"
Cohesion: 0.17
Nodes (17): browser(), account(), account(), background, current(), definition, preview(), profile() (+9 more)

### Community 9 - "coaching/runs.ts"
Cohesion: 0.09
Nodes (38): LeasedJob, CoachingWork, coachKind, CoachResult, CoachRun, JobKind, summaryKind, SummaryRun (+30 more)

### Community 11 - "scripts"
Cohesion: 0.11
Nodes (18): scripts, build, build:api, build:vercel, build:web, check:backend, db:local, dev (+10 more)

### Community 12 - "runtime.ts"
Cohesion: 0.15
Nodes (15): createActivityRouter(), createAdminRouter(), day(), createAiClient(), AvailableRun, RunDispatch, startAiWorker(), WorkScheduler (+7 more)

### Community 13 - "dependencies"
Cohesion: 0.12
Nodes (17): dependencies, bcrypt@6.0.0, cookie@1.1.1, express@5.3.0, express-rate-limit@8.7.5, jose@6.2.18, lucide-react@1.77.0, mongodb@7.9.0 (+9 more)

### Community 14 - "sessions.ts"
Cohesion: 0.15
Nodes (17): calendar(), invalidZone(), isoDay(), summarizeActivity(), Status, statuses, AuthConfig, GOOGLE_CALLBACK_PATH (+9 more)

### Community 15 - "ApiError"
Cohesion: 0.22
Nodes (22): currentLease(), runExpired(), summarizeConversation(), conversationNotFound(), createCoachingRuns(), claimWork(), failReply(), finishSummary() (+14 more)

### Community 16 - "roadmap.integration.js"
Cohesion: 0.19
Nodes (11): startApi(), startApi(), startApi(), current(), draft, requests, runStatus(), startApi() (+3 more)

### Community 17 - "compilerOptions"
Cohesion: 0.14
Nodes (13): compilerOptions, jsx, lib, module, moduleResolution, noEmit, noUnusedLocals, noUnusedParameters (+5 more)

### Community 19 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, erasableSyntaxOnly, module, noEmitOnError, outDir, rewriteRelativeImportExtensions, rootDir, strict (+3 more)

### Community 20 - "Arcshift application guide"
Cohesion: 0.14
Nodes (14): Admin and public pages, Arcshift application guide, Authentication, Backend release, Build order, Career activity, Career profile and onboarding, Coaching, history, and memory (+6 more)

### Community 21 - "ADDED Requirements"
Cohesion: 0.14
Nodes (13): Account Authentication, ADDED Requirements, Purpose, Requirement: Google authentication, Requirement: JWT browser session, Requirement: Password authentication, Scenario: Google email matches an existing local account, Scenario: Link Google from a password account (+5 more)

### Community 22 - "coaching.integration.js"
Cohesion: 0.23
Nodes (8): coachRequests, completed(), conversation(), history(), send(), status(), waitSummary(), waitUntil()

### Community 23 - "ADDED Requirements"
Cohesion: 0.14
Nodes (13): ADDED Requirements, Career Profile, Purpose, Requirement: Career context validation, Requirement: Onboarding state, Requirement: Owner-specific profile, Requirement: Versioned profile updates, Scenario: A different user is named in a request (+5 more)

### Community 24 - "ADDED Requirements"
Cohesion: 0.14
Nodes (13): ADDED Requirements, MongoDB Runtime, Purpose, Requirement: Account and session indexes, Requirement: Database readiness probe, Requirement: Database shutdown, Requirement: MongoDB configuration, Scenario: A required index cannot be created (+5 more)

### Community 25 - "ref_node_fs"
Cohesion: 0.27
Nodes (7): startServer(), closeDatabase(), stopServer(), connectOrStart(), directClient(), startLocalMongo(), storagePath

### Community 26 - "Requirement: Google authentication"
Cohesion: 0.14
Nodes (13): account-authentication Specification, Purpose, Requirement: Google authentication, Requirement: JWT browser session, Requirement: Password authentication, Requirements, Scenario: Google email matches an existing local account, Scenario: Link Google from a password account (+5 more)

### Community 27 - "ai-client.test.js"
Cohesion: 0.18
Nodes (3): groq, messages, qwen

### Community 28 - "vite"
Cohesion: 0.40
Nodes (4): vite@8.3.8, @vitejs/plugin-react@6.3.0, vite, @vitejs/plugin-react

### Community 29 - "Requirements"
Cohesion: 0.14
Nodes (13): career-profile Specification, Purpose, Requirement: Career context validation, Requirement: Onboarding state, Requirement: Owner-specific profile, Requirement: Versioned profile updates, Requirements, Scenario: A different user is named in a request (+5 more)

### Community 31 - "Requirements"
Cohesion: 0.14
Nodes (13): mongodb-runtime Specification, Purpose, Requirement: Account and session indexes, Requirement: Database readiness probe, Requirement: Database shutdown, Requirement: MongoDB configuration, Requirements, Scenario: A required index cannot be created (+5 more)

### Community 32 - "ADDED Requirements"
Cohesion: 0.15
Nodes (12): ADDED Requirements, Career Roadmap, Purpose, Requirement: Initial roadmap generation, Requirement: Milestone progress, Requirement: Owner-scoped run recovery, Requirement: Roadmap reads and history, Scenario: Generation completes (+4 more)

### Community 33 - "ADDED Requirements"
Cohesion: 0.15
Nodes (12): ADDED Requirements, Coaching Memory, Purpose, Requirement: Bounded coaching context, Requirement: Durable coaching turns, Requirement: Exact conversation history, Requirement: Recent session memory, Scenario: A model response contains an unsupported plan change (+4 more)

### Community 34 - "Requirements"
Cohesion: 0.15
Nodes (12): career-roadmap Specification, Purpose, Requirement: Initial roadmap generation, Requirement: Milestone progress, Requirement: Owner-scoped run recovery, Requirement: Roadmap reads and history, Requirements, Scenario: Generation completes (+4 more)

### Community 35 - "Requirements"
Cohesion: 0.15
Nodes (12): coaching-memory Specification, Purpose, Requirement: Bounded coaching context, Requirement: Durable coaching turns, Requirement: Exact conversation history, Requirement: Recent session memory, Requirements, Scenario: A model response contains an unsupported plan change (+4 more)

### Community 36 - "ADDED Requirements"
Cohesion: 0.17
Nodes (11): ADDED Requirements, Career Workspace, Purpose, Requirement: Account workspace access, Requirement: Coaching and proposal review, Requirement: Profile and roadmap navigation, Requirement: Same-origin build, Scenario: Reload a private route (+3 more)

### Community 37 - "ADDED Requirements"
Cohesion: 0.17
Nodes (11): ADDED Requirements, Purpose, Requirement: Guarded approval, Requirement: Reviewable roadmap preview, Requirement: Validated revision semantics, Roadmap Approval, Scenario: Approval is submitted twice, Scenario: Coach suggests a justified change (+3 more)

### Community 38 - "Requirements"
Cohesion: 0.17
Nodes (11): Purpose, Requirement: Guarded approval, Requirement: Reviewable roadmap preview, Requirement: Validated revision semantics, Requirements, roadmap-approval Specification, Scenario: Approval is submitted twice, Scenario: Coach suggests a justified change (+3 more)

### Community 39 - "createSessionManager"
Cohesion: 0.32
Nodes (12): createAuthCookies(), createSessionManager(), accessClaims(), authenticate(), issue(), logout(), refreshCredential(), renew() (+4 more)

### Community 40 - "createRoadmapStore"
Cohesion: 0.36
Nodes (8): createRoadmapStore(), activeFor(), advanceRoadmap(), publishInitial(), publishRevision(), updateMilestone(), readReceipt(), versionFor()

### Community 41 - "Backend release checks"
Cohesion: 0.25
Nodes (5): Backend release checks, Deployed smoke test, Local verification, Rollback and recovery, Staging configuration

### Community 42 - "AI Career Agent Build and Copy Guide"
Cohesion: 0.22
Nodes (9): 1. Product language, 2. Account and onboarding copy, 4. Error codes and recovery ownership, 8. Demo and release copy, 9. Help and future-feature copy, AI Career Agent Build and Copy Guide, Copy starters for the backlog, Help entries for launch (+1 more)

### Community 43 - "ADDED Requirements"
Cohesion: 0.22
Nodes (8): ADDED Requirements, Arcshift Dashboards, Requirement: Member roadmap overview, Requirement: Public recovery and terms, Requirement: Single-owner admin dashboard, Scenario: An unrelated account tries to view metrics, Scenario: Member updates a milestone, Scenario: Visitor opens an obsolete URL

### Community 44 - "ADDED Requirements"
Cohesion: 0.22
Nodes (8): ADDED Requirements, Backend HTTP, Purpose, Requirement: API error responses, Requirement: Liveness probe, Scenario: An uncaught handler failure occurs, Scenario: Route does not exist, Scenario: Running API reports liveness

### Community 45 - "ADDED Requirements"
Cohesion: 0.22
Nodes (8): ADDED Requirements, Requirement: Hosted database readiness, Requirement: Request-scoped AI dispatch, Requirement: Same-origin application on Vercel, Scenario: Concurrent dispatch, Scenario: Database unavailable, Scenario: Direct browser navigation, Scenario: Unknown route

### Community 46 - "backend-http Specification"
Cohesion: 0.22
Nodes (8): backend-http Specification, Purpose, Requirement: API error responses, Requirement: Liveness probe, Requirements, Scenario: An uncaught handler failure occurs, Scenario: Route does not exist, Scenario: Running API reports liveness

### Community 48 - "index.js"
Cohesion: 0.25
Nodes (4): { app }, env, @vercel/functions@3.11.3, @vercel/functions

### Community 49 - "Proposal"
Cohesion: 0.25
Nodes (7): Capabilities, Impact, Modified Capabilities, New Capabilities, Proposal, What Changes, Why

### Community 50 - "Proposal"
Cohesion: 0.25
Nodes (7): Capabilities, Impact, Modified Capabilities, New Capabilities, Proposal, What Changes, Why

### Community 51 - "ADDED Requirements"
Cohesion: 0.25
Nodes (7): ADDED Requirements, Career Activity, Requirement: Persist the member streak summary, Requirement: Personal activity calendar, Scenario: A member reloads the calendar, Scenario: A member saves roadmap progress, Scenario: Another member views their calendar

### Community 52 - "Proposal"
Cohesion: 0.25
Nodes (7): Capabilities, Impact, Modified Capabilities, New Capabilities, Proposal, What Changes, Why

### Community 53 - "Proposal"
Cohesion: 0.25
Nodes (7): Capabilities, Impact, Modified Capabilities, New Capabilities, Proposal, What Changes, Why

### Community 54 - "Proposal"
Cohesion: 0.25
Nodes (7): Capabilities, Impact, Modified Capabilities, New Capabilities, Proposal, What Changes, Why

### Community 55 - "Proposal"
Cohesion: 0.25
Nodes (7): Capabilities, Impact, Modified Capabilities, New Capabilities, Proposal, What Changes, Why

### Community 56 - "Proposal"
Cohesion: 0.25
Nodes (7): Capabilities, Impact, Modified Capabilities, New Capabilities, Proposal, What Changes, Why

### Community 57 - "Proposal"
Cohesion: 0.25
Nodes (7): Capabilities, Impact, Modified Capabilities, New Capabilities, Proposal, What Changes, Why

### Community 58 - "Proposal"
Cohesion: 0.25
Nodes (7): Capabilities, Impact, Modified Capabilities, New Capabilities, Proposal, What Changes, Why

### Community 59 - "Proposal"
Cohesion: 0.25
Nodes (7): Capabilities, Impact, Modified Capabilities, New Capabilities, Proposal, What Changes, Why

### Community 60 - "ADDED Requirements"
Cohesion: 0.25
Nodes (7): ADDED Requirements, Backend Release, Purpose, Requirement: Backend smoke tests, Requirement: Production configuration and readiness, Scenario: Compiled production backend restarts, Scenario: MongoDB accepts only standalone operations

### Community 61 - "Proposal"
Cohesion: 0.25
Nodes (7): Capabilities, Impact, Modified Capabilities, New Capabilities, Proposal, What Changes, Why

### Community 62 - "backend-release Specification"
Cohesion: 0.25
Nodes (7): backend-release Specification, Purpose, Requirement: Backend smoke tests, Requirement: Production configuration and readiness, Requirements, Scenario: Compiled production backend restarts, Scenario: MongoDB accepts only standalone operations

### Community 63 - "vercel.json"
Cohesion: 0.25
Nodes (7): buildCommand, fluid, framework, functions, index.js, maxDuration, $schema

### Community 66 - "createMongoDatabase"
Cohesion: 0.33
Nodes (4): createMongoDatabase(), checkReadiness(), probeMongo(), initializeMongoIndexes()

### Community 67 - "5. Qwen prompt drafts and response contracts"
Cohesion: 0.29
Nodes (7): 5. Qwen prompt drafts and response contracts, Coaching turn prompt, Configuration and evaluation notes, Initial roadmap prompt, Roadmap revision prompt, Session summary prompt, Shared system prompt

### Community 68 - "Proposal"
Cohesion: 0.29
Nodes (6): Capabilities, Impact, New Capabilities, Proposal, What Changes, Why

### Community 69 - "6. Engineering handoff text"
Cohesion: 0.33
Nodes (6): 6. Engineering handoff text, API response examples, Configuration documentation, Issue starter text, README draft, Suggested code and documentation placement

### Community 70 - "7. Trust, support, and launch drafts"
Cohesion: 0.33
Nodes (6): 7. Trust, support, and launch drafts, AI guidance and evidence, Operations runbook text, Privacy notice starter, Support and incident text, Terms starter

### Community 71 - "Requirement: Configurable JSON model provider"
Cohesion: 0.33
Nodes (5): ADDED Requirements, AI Provider, Requirement: Configurable JSON model provider, Scenario: Both providers are present, Scenario: Use Groq for career guidance

### Community 72 - "Design"
Cohesion: 0.33
Nodes (5): Context, Decisions, Design, Goals / Non-Goals, Risks / Trade-offs

### Community 73 - "Design"
Cohesion: 0.33
Nodes (5): Context, Decisions, Design, Goals / Non-Goals, Risks / Trade-offs

### Community 74 - "Design"
Cohesion: 0.33
Nodes (5): Context, Decisions, Design, Goals / Non-Goals, Risks / Trade-offs

### Community 75 - "Design"
Cohesion: 0.33
Nodes (5): Context, Decisions, Design, Goals / Non-Goals, Risks / Trade-offs

### Community 76 - "Design"
Cohesion: 0.33
Nodes (5): Context, Decisions, Design, Goals / Non-Goals, Risks / Trade-offs

### Community 77 - "Design"
Cohesion: 0.33
Nodes (5): Context, Decisions, Design, Goals / Non-Goals, Risks / Trade-offs

### Community 78 - "Design"
Cohesion: 0.33
Nodes (5): Context, Decisions, Design, Goals / Non-Goals, Risks / Trade-offs

### Community 79 - "Arcshift"
Cohesion: 0.33
Nodes (6): Arcshift, Deploy to Vercel, Project documentation, Run locally, Verify changes, What you can do

### Community 80 - "Design"
Cohesion: 0.40
Nodes (4): Context, Decisions, Design, Risks / Trade-offs

### Community 81 - "3. Dashboard, coaching, history, and settings"
Cohesion: 0.50
Nodes (4): 3. Dashboard, coaching, history, and settings, AI coach and proposal review, Dashboard and roadmap, History, settings, and global feedback

### Community 82 - "Design"
Cohesion: 0.50
Nodes (3): Context, Decisions, Design

## Knowledge Gaps
- **25 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `mongodb` connect `coaching/runs.ts` to `auth/routes.ts`, `roadmap/routes.ts`, `auth.integration.js`, `roadmap/runs.ts`, `profile.integration.js`, `revision.ts`, `package.json`, `revision.integration.js`, `runtime.ts`, `dependencies`, `sessions.ts`, `roadmap.integration.js`, `coaching.integration.js`, `ref_node_fs`?**
  _High betweenness centrality (0.108) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `createSessionManager()` (e.g. with `authenticate()` and `issue()`) actually correct?**
  _`createSessionManager()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Should `roadmap.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.051639833035181874 - nodes in this community are weakly interconnected._
- **Why does `careerProfiles()` connect `coaching/runs.ts` to `auth/routes.ts`, `roadmap/runs.ts`, `sessions.ts`, `ApiError`, `Arcshift application guide`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Should `auth/routes.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09475806451612903 - nodes in this community are weakly interconnected._
- **Why does `MongoDB startup indexes` connect `Arcshift application guide` to `coaching/runs.ts`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Should `auth.integration.js` be split into smaller, more focused modules?**
  _Cohesion score 0.11264367816091954 - nodes in this community are weakly interconnected._