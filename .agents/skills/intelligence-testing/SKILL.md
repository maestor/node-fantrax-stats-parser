---
name: intelligence-testing
description: "Use when working on application code that should be built with behavior-first TDD: define the real usage story, write the highest-signal failing test first, implement the smallest change to pass it, and refactor only after behavior is protected. Helps choose the right test layer, cover realistic user, API, mobile, and operator scenarios, avoid mock-heavy duplication, and remove speculative defensive branches or fallback logic that cannot be exercised by real usage."
---

# Intelligence Testing

## Overview

Use this skill when the goal is not just "add tests", but to drive implementation through realistic behavior first.

This skill uses behavior-first TDD:

- Write the real usage story first
- Turn that story into the best failing test first
- Implement the smallest production change that makes the test pass
- Refactor only after the behavior is protected

The default bias is:

- Start from real behavior, not internal functions
- Prefer the highest-signal failing test that still keeps failures understandable
- Cover realistic scenarios completely
- Delete unreachable or speculative logic instead of defending it with artificial tests

If the repository already has project-specific testing rules, follow those rules first and apply this skill as the decision-making lens behind them.

## Core Rules

- Define the real actor first: browser user, mobile user, API consumer, admin, importer operator, scraper run, scheduled job.
- Describe the task as a usage flow before writing code or tests.
- Write the failing test before implementation unless the user explicitly asks for another workflow.
- Test visible behavior, returned API behavior, persisted data behavior, or operator-visible outcomes.
- Do not add branches for imagined futures unless the product explicitly needs them now.
- Do not keep fallback logic that no real scenario can trigger.
- Do not add helper-only tests just to justify dead code.
- Account for every added or changed behavior and executable path before the final quality gate; a passing happy-path test is not completion.
- Keep required validation and failure handling even when uncommon or awkward to test. Difficulty exercising a path is not evidence that it is unreachable.
- When a feature or UI element is intentionally removed, delete tests and assertions that only existed for that behavior.
- Keep a negative assertion only when the absence itself is a real product requirement, such as permission gating, security, or a replaced user flow.
- Prefer one strong integration or behavior test over several thin mock-wiring tests.
- Keep pure unit tests for deterministic logic that is reused or too awkward to reach through behavior tests.
- Refactor only after the failing test has gone green.

## Token Discipline

- Keep the workflow strict, but keep narration short.
- Do not narrate every TDD step unless the user asks for that level of detail.
- Do not dump full scenario lists in routine updates.
- Report only the essentials by default:
  - chosen test layer
  - behavior proved
  - remaining risk or verification gap
- Expand reasoning only when the risk is non-obvious, the user asks for depth, or a product decision needs clarification.

## Workflow

### 1. Frame the usage story

Before editing, write the smallest realistic story that proves the task:

- Who is doing the action?
- What do they do?
- What should they observe?
- What can realistically go wrong?

Good examples:

- "User opens the player table, changes season, and sees rows update."
- "API consumer requests a record detail with an invalid id and gets a clear `400` or `404`."
- "Importer runs against partially stale upstream data and preserves good local data until the sync succeeds."

Read the repository's verification command and coverage configuration before implementation. Identify enforced metrics, thresholds, file scope, and how to run the relevant tests with coverage independently of the full gate. If the requirement is 100%, plan for every enforced metric, including branches and functions when configured, rather than just lines.

### 2. Pick the first failing test

Choose the thinnest test layer that still proves the real behavior, then write that test first.

Behavior-first TDD does not mean unit-test-first by default. It means the first test should live at the most realistic layer for the behavior under change.

Use this bias:

- UI rendering, labels, interaction, loading, empty, and error states: behavior tests with Testing Library first
- Cross-page flows, browser routing, responsive behavior, keyboard flows, or shared shell behavior: E2E tests first
- Endpoint + service + database composition: integration tests through the real HTTP boundary and real temporary DB or realistic fixtures first
- Pure scoring, parsing, mapping, normalization, and reducer logic: focused unit tests first
- Scraping/import pipelines: realistic input fixtures plus integration-style verification of normalized output, stored records, or operator-visible summaries first

Read [references/scenario-matrix.md](./references/scenario-matrix.md) when the task spans multiple layers or includes UI, API, and import behavior together.

### 3. Go red on realistic behavior

Make the first test fail for the right reason.

- The failure should prove the requested behavior does not exist yet or is currently wrong.
- The test should describe the user, caller, or operator-visible outcome.
- Avoid starting with internal helper assertions unless the logic is genuinely pure and isolated.
- Keep the initial failing test narrow enough to guide implementation, but real enough to matter.

### 4. Go green with the smallest change

Implement the smallest production change that makes the failing test pass.

- Prefer simpler production code over defensive indirection
- Add only the logic justified by the failing scenario
- Resist adding future-facing branches while the first behavior is still being proven
- If the implementation exposes dead parameters, impossible states, or duplicate paths, simplify them instead of preserving them

### 5. Expand to the realistic scenario set

After the first test is green, add the remaining realistic scenarios for the task, using another red-green cycle for each additional behavior.

Cover only scenarios that a real user or system can actually hit, but cover those thoroughly.

Default checklist:

- Success path
- Loading or in-progress state when visible
- Empty state when valid
- Invalid input that users or callers can really send
- Upstream/API/DB/network failure that the product intentionally handles
- Persistence/cache/reload behavior when the feature depends on it
- Accessibility behavior for interactive UI
- Navigation, deep link, or parameter behavior when routing is involved

Reconcile the actual diff with the scenarios as implementation grows. For each added or changed path, identify its real trigger, observable outcome, and test that asserts that outcome. Include helpers, callbacks, early returns, defaults, short-circuit expressions, and error paths; a feature-level checklist can miss these. Existing tests count when they actually exercise and assert the changed behavior. Keep this accounting brief in working notes.

Do not invent branches only because "something might happen someday." If a branch has no realistic trigger and no required contract, simplify or delete it after checking callers and boundary guarantees. Rare network failures, malformed external input, permission failures, and supported legacy data can still be real scenarios. Use controlled failures at actual dependency boundaries when needed; do not fabricate impossible internal states to make a counter green.

When behavior is removed, treat test cleanup as part of the change:

- Delete assertions that only proved the removed behavior used to exist
- Delete now-obsolete fixtures, helpers, and mock setup that only supported those assertions
- Replace a positive assertion with a negative one only when the product truly needs absence to stay enforced

### 6. Refactor after protection exists

Once the behavior is protected:

- Remove dead parameters, impossible unions, and unused fallbacks
- Consolidate duplicated logic when its callers share the same rule and tests protect the behavior each caller relies on
- Improve naming, structure, and extraction without changing protected behavior
- Keep the test suite focused on observable outcomes, not new internals created during refactor

### 7. Close coverage before the final gate

After refactoring, review the final production diff against the tests and resolve every path without meaningful protection:

- **Reachable behavior:** add a test through the appropriate public boundary with an assertion on its outcome. Executing a line alone does not prove behavior.
- **Redundant or unreachable logic:** establish why from actual callers, validated contracts, or invariants, then remove or simplify it. Do not remove required behavior merely to meet coverage.
- **Required behavior that is hard to exercise:** improve the test seam or choose a suitable test layer. If the environment prevents proof, record a concrete blocker rather than claiming completion.

Run the smallest meaningful coverage-enabled test selection during development and inspect uncovered lines, branches, and functions in all added or changed production files, including new files never imported by tests. Resolve gaps before invoking the full verify script. Use the repository's coverage instrumentation and inclusion rules; do not lower thresholds, add ignore directives, exclude files, or add assertions that only check that code ran to satisfy a percentage.

A focused run diagnoses the touched code; it does not prove a global threshold if other tests or files are omitted. When the gate enforces wider coverage, run the required coverage suite before the full gate if it is separately available. Reuse fresh reports for the same code and tests rather than repeating identical runs. If coverage is only available inside the full gate, complete the diff-to-test review first, then run that gate and state this limitation.

Read [references/scenario-matrix.md](./references/scenario-matrix.md#coverage-gap-decisions) for examples of testing realistic failures versus removing unreachable branches.

### 8. Verify at the right depth

- Run the repository's required quality gate after the changed behavior is protected and available coverage evidence meets the applicable thresholds.
- Treat the gate as confirmation, not the first search for missing tests. Unexpected failures still require investigation; this workflow cannot guarantee a first-run pass.
- After further edits, refresh the affected test/coverage evidence and rerun required checks as appropriate.
- Report behavior verified, coverage actually measured, and any concrete unverified risk or environment blocker. Do not claim 100% from inspection alone.

## Anti-Patterns

- Testing component methods instead of user-visible behavior
- Mocking most of the stack and then claiming integration confidence
- Preserving unreachable branches and covering them with isolated tests
- Using the full verify script as the first coverage audit after implementation
- Removing real validation or failure handling because a path is difficult to test
- Converting removed-behavior tests into "it does not exist" assertions when no real requirement needs that proof
- Adding "just in case" fallbacks without a concrete scenario
- Duplicating the same happy path in unit, integration, and E2E suites
- Using TDD as an excuse to start from internal helper tests when the behavior belongs at UI, route, or integration level
- Hiding product uncertainty inside defensive logic instead of clarifying the expected behavior

## Expected Behavior When This Skill Is Used

When applying this skill to a task:

1. State the primary real usage flow being protected.
2. Choose the highest-signal first failing test intentionally.
3. Implement only enough production code to make that test pass.
4. Add the remaining realistic scenarios that must be covered.
5. Refactor only after protection exists.
6. Reconcile every changed path with meaningful tests or simplify it when demonstrably unnecessary.
7. Close coverage gaps with development-time test runs before the final quality gate.
8. Finish by reporting what real behavior was verified and what remains unverified.
