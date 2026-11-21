# Career Workspace

## Purpose

Provide the signed-in browser workspace that takes a user from onboarding through a persistent, reviewable career plan.

## ADDED Requirements

### Requirement: Account workspace access

The browser app SHALL support registration, sign-in, Google account entry and linking, session restoration, and logout using the existing API. Signed-in users without a profile SHALL be directed to onboarding before the workspace.

#### Scenario: User returns to the app

- **WHEN** a user has a renewable session and opens a protected page
- **THEN** the app restores the session and shows the appropriate account or onboarding state

### Requirement: Profile and roadmap navigation

The app SHALL save and edit a career profile, generate a roadmap, display milestone status and evidence, record edits, and reopen immutable versions. The UI SHALL show request progress and recoverable conflict or failure states.

#### Scenario: Update an active milestone

- **WHEN** the user saves valid progress in the current roadmap
- **THEN** the dashboard displays the saved status and the user can reopen an earlier version

### Requirement: Coaching and proposal review

The app SHALL allow users to send and resume coaching turns, browse complete archived conversations by page, and review an available proposal before applying it. A pending reply SHALL be recoverable after reload using its run ID.

#### Scenario: Review a coach suggestion

- **WHEN** the coach returns a proposal
- **THEN** the user can inspect the rationale and before-and-after changes and explicitly approve the preview

### Requirement: Same-origin build

Express SHALL serve the built React routes and assets while preserving the existing API and probe responses. The UI SHALL remain usable on desktop and mobile.

#### Scenario: Reload a private route

- **WHEN** the browser directly opens a valid React workspace path
- **THEN** Express serves the React entry point and the app checks the session
