# Scenario Matrix

Use this file when a task needs a more concrete behavior-first TDD checklist.

For each area below:

- Start with the highest-signal failing test for the requested behavior
- Make it pass with the smallest implementation
- Then add the rest of the realistic scenarios

## Web UI

Prefer behavior tests for local component/page work and E2E when the behavior depends on routing, browser layout, shared shell state, or full-page interactions.

Best first failing tests:

- A user-visible behavior test for a single screen interaction
- An E2E test first only when the behavior genuinely depends on routing, layout, or full browser flow

Typical realistic scenarios:

- First render shows the expected title, controls, and initial data state
- Loading indicator appears only while data is unresolved
- Empty state is clear and not confused with an error
- Error state explains failure and leaves the screen usable
- Search, filters, sort, tabs, dialogs, and drawers work through visible controls
- URL params, deep links, and back/forward navigation keep the right state
- Keyboard focus, labels, and roles still support the main flow
- Refresh, cache reuse, or retry behavior works if the feature depends on it

Avoid:

- Testing private methods
- Driving branches through CSS selectors when accessible queries exist
- Mocking core state services if the user flow can exercise the real ones

## Mobile App

Prefer React Native Testing Library behavior tests for screen logic and route-level tests for Expo Router wiring. Use device-level or end-to-end checks only when touch, platform, or navigation integration truly matters.

Best first failing tests:

- A screen-level behavior test for the visible user action
- A route-level test first when params or navigation wiring are the real behavior under change

Typical realistic scenarios:

- Screen loads with API data and keeps visible state stable through refresh
- Empty/error/loading states are distinct and understandable
- Search, filters, and sort react to real text entry and presses
- Detail routes reject invalid params cleanly
- Required accessibility labels and roles exist for navigation and alerts
- Secrets stay out of URLs, rendered UI, logs, and cache keys

Avoid:

- Snapshot-heavy tests with little behavioral meaning
- Hardcoded locale strings when shared translation helpers already define the output shape
- Keeping optional branches that no actual route or screen can reach

## Backend API

Prefer integration tests through the HTTP boundary when behavior spans routing, services, queries, persistence, auth, caching, or schema validation.

Best first failing tests:

- A route/integration test first when the contract depends on multiple layers
- A focused unit test first only when the changed logic is truly pure

Typical realistic scenarios:

- Happy path returns the expected response shape and status
- Invalid params return the intended `400` or `404`
- Auth-protected routes reject missing or invalid credentials
- Empty datasets return stable response shapes
- Cache headers, ETags, or pagination behave consistently when part of the contract
- Data imported to the database is the data the route later returns
- OpenAPI or response-schema expectations still match live responses

Avoid:

- Mocking the database for flows that are really route-plus-data behavior
- Duplicating the same happy path in route, service, and query tests
- Writing tests that only prove parameter forwarding or internal delegation

## Importers, Scrapers, And Sync Jobs

Treat these like operator-facing product features, not just scripts.

Best first failing tests:

- A realistic fixture or integration-style test for the observable sync/import outcome
- A pure parser/mapping unit test first only after extracting deterministic logic out of the CLI or browser shell

Typical realistic scenarios:

- Valid upstream input normalizes into the expected stored or emitted output
- Partial bad input fails clearly without corrupting already good data
- Re-runs are idempotent when the workflow expects repeat execution
- Logs or summaries expose the outcome an operator actually needs
- Retry or backoff logic is covered only when the tool really uses it in production
- Pure parsing rules are extracted into testable modules when the Playwright or CLI shell itself is not the right unit-test surface

Avoid:

- Pulling CLI entrypoints directly into unit suites when extracted pure logic would be cleaner
- Adding broad fallback parsing branches for shapes that have never been observed
- Marking a sync as "safe" without proving what happens to existing data on failure

## Cross-Cutting Heuristics

- If a branch cannot be tied to a realistic scenario, remove it.
- If a test does not describe observable behavior, question whether it belongs.
- If a unit test and an integration test prove the same thing, keep the one with better signal.
- If coverage pressure encourages fake scenarios, simplify the code instead.
- If the task changes behavior across UI and API, make sure both the user-visible result and the server contract are validated.
