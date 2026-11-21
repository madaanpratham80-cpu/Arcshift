# Career Activity

## ADDED Requirements

### Requirement: Personal activity calendar

Arcshift SHALL show an activity heat map for the last 365 local calendar days with active-day and streak totals derived from the signed-in member's recorded activity.

#### Scenario: A member saves roadmap progress

- **WHEN** a member saves a new roadmap version
- **THEN** the heat map counts the saved version on its local calendar day

#### Scenario: Another member views their calendar

- **WHEN** a different account opens its dashboard
- **THEN** its activity results contain only that account's records

### Requirement: Persist the member streak summary

Arcshift SHALL save the calculated activity totals, calendar day, time zone, and calculation timestamp in MongoDB for the signed-in member.

#### Scenario: A member reloads the calendar

- **WHEN** Arcshift returns a successfully calculated activity calendar
- **THEN** its streak summary is saved against that member's account
