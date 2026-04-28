---
name: local-first-verification
description: Use when deciding how to verify a change locally before handoff, review, or commit. Helps choose the cheapest meaningful checks that still prove the touched behavior, coordinate local environment assumptions, avoid both under-testing and wasteful over-testing, keep fixtures and mocks honest, and report only real residual risk.
---

# Local First Verification

## Overview

Use this skill when a change needs verification, but not every task needs the heaviest possible check immediately.

The goal is to verify changes locally in the cheapest order that still provides honest confidence:

- start with the most relevant low-cost checks
- escalate only when risk or uncertainty requires it
- do not confuse speed with shallow verification
- do not confuse expensive verification with meaningful verification

## Core Rules

- Match verification depth to the behavior changed.
- Prefer the cheapest check that can actually fail for the right reason.
- Escalate when the cheaper check cannot prove the real behavior.
- Verify user-visible behavior with user-visible checks.
- Verify integration boundaries with integration checks.
- Keep mocks and fixtures aligned with current runtime behavior.
- Coordinate with local services, ports, credentials, and background processes before expensive runs.
- Report only what was truly verified, not what was merely assumed.

## Token Discipline

- Do not narrate every command or every check.
- Summarize only:
  - checks run
  - behavior covered
  - gaps or blocked verification
- Expand only when a failure, environment issue, or hidden risk needs explanation.

## Workflow

### 1. Identify the touched surface

Classify the change:

- pure logic
- UI behavior
- routing or navigation
- API contract
- persistence or caching
- environment or config
- styling or accessibility
- cross-layer integration

Read [references/verification-matrix.md](./references/verification-matrix.md) when the right check depth is not obvious.

### 2. Choose the first meaningful check

Good starting points:

- typecheck or lint for type-level or structural edits
- focused unit or behavior tests for isolated logic or local UI changes
- integration tests for API, DB, caching, or multi-layer flows
- browser or device verification for visual, responsive, or interaction-sensitive changes

Start with a check that is cheap and relevant, not merely familiar.

### 3. Confirm local assumptions

Before heavier verification, confirm what the run depends on:

- required local servers
- ports already in use
- environment variables or credentials
- fixture or mock mode versus live mode
- generated artifacts already up to date

Do not burn time debugging a failing verification flow that was invalid before it started.

### 4. Escalate only when needed

Escalate when:

- the first check cannot observe the changed behavior
- the change crosses boundaries
- production risk is higher than local signal so far
- the repo's standard quality gate is required before finishing

Examples:

- from unit test to integration test
- from behavior test to E2E
- from local mock mode to live local backend
- from targeted test to full verify

### 5. Keep fixtures and mocks honest

When a change touches contract, routing, request shape, or serialized output:

- update fixtures
- update mocks
- verify they still represent real runtime behavior

Do not let passing local tests hide drift between mock mode and live mode.

### 6. Stop when confidence is sufficient and honest

The goal is not maximal command count. Stop when:

- the changed behavior has been proved at the right depth
- the repo's required gate has passed, if applicable
- remaining uncertainty is minor and explicitly reported

## Anti-Patterns

- Running only cheap checks that cannot observe the actual change
- Jumping straight to the heaviest check for every small edit
- Treating fixture mode as enough when the contract or runtime behavior changed
- Claiming full confidence after typecheck only
- Re-running large verification commands repeatedly without learning from the first failure
- Hiding blocked verification behind vague language

## Expected Behavior When This Skill Is Used

When applying this skill to a task:

1. Identify what changed and what kind of signal it needs.
2. Run the cheapest meaningful verification first.
3. Escalate only when the cheaper check is insufficient.
4. Keep local assumptions, fixtures, and mocks honest.
5. Report verified behavior and any real gaps briefly.
