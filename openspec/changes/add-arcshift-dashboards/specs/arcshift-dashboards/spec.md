# Arcshift Dashboards

## ADDED Requirements

### Requirement: Member roadmap overview

The member dashboard SHALL display milestone status, estimated hours remaining, and progress by phase using the active roadmap.

#### Scenario: Member updates a milestone

- **WHEN** a progress change is saved
- **THEN** the member dashboard reflects the updated roadmap totals

### Requirement: Single-owner admin dashboard

The app SHALL expose aggregate operational metrics only to a verified Google session matching the configured Gmail and the bound immutable Google subject.

#### Scenario: An unrelated account tries to view metrics

- **WHEN** a signed-in account lacks the authorized Google identity
- **THEN** the admin API returns HTTP 403 without metric data

### Requirement: Public recovery and terms

Unknown browser routes SHALL return HTTP 404 with the recovery page and a link to the public Terms and Conditions page.

#### Scenario: Visitor opens an obsolete URL

- **WHEN** an unknown browser path is requested
- **THEN** Arcshift shows a navigation option back to the homepage and a link to the terms
