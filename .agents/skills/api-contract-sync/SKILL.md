---
name: api-contract-sync
description: Use when backend and frontend or mobile clients share an API contract that must stay in sync. Helps treat the contract as a source of truth, update schemas or OpenAPI before consumer code drifts, regenerate typed clients safely, coordinate breaking and additive changes, and verify that runtime responses, generated types, and consuming code still agree.
---

# API Contract Sync

## Overview

Use this skill when API changes affect more than one codebase or layer.

The goal is to keep:

- the contract source of truth
- generated types or clients
- backend behavior
- frontend or mobile consumers

in sync at the same time.

This skill is especially useful for TypeScript stacks that use OpenAPI, JSON Schema, Zod-derived schemas, generated types, or shared DTO packages.

## Core Rules

- Identify the contract source of truth first.
- Change the source of truth before changing consumers that depend on it.
- Do not hand-edit generated artifacts.
- Prefer additive contract changes when possible.
- Treat breaking changes as deliberate decisions, not incidental refactors.
- Update all affected consumers in the same task when practical.
- Verify runtime behavior, not just generated TypeScript.
- Remove stale fields, params, and client assumptions once the new contract is in place.

## Token Discipline

- Keep reporting short by default.
- Report only:
  - source of truth changed
  - consumers updated
  - generation or validation performed
  - remaining compatibility risk
- Expand only when the contract change is breaking, cross-repo, or operationally risky.

## Workflow

### 1. Find the source of truth

Determine which artifact defines the contract:

- OpenAPI document
- schema definitions
- shared DTO package
- route-level contract builders

If the repo has both generated files and handwritten types, prefer the upstream source and treat generated output as disposable.

### 2. Map the consumers

Identify all consumers that depend on the contract:

- web frontend
- mobile app
- other backend services
- tests, fixtures, mocks, or fake servers
- generated types or SDKs

Read [references/contract-change-checklist.md](./references/contract-change-checklist.md) when the change is cross-repo or potentially breaking.

### 3. Change the contract at the source

Update the source-of-truth contract first.

Typical changes:

- add or remove fields
- change nullability or optionality
- change enum values
- add or remove query or path params
- split or rename endpoints
- tighten validation rules

Prefer the smallest contract change that solves the actual product need.

### 4. Regenerate and reconcile consumers

After the source changes:

- regenerate typed clients or types
- update consuming code
- fix mocks, fixtures, and tests that model the contract
- remove outdated assumptions and compatibility shims that are no longer needed

Do not keep drift alive by patching consumer-side handwritten types to imitate the new contract temporarily.

### 5. Verify both compile-time and runtime agreement

Check both:

- compile-time agreement: generated types, app builds, typecheck
- runtime agreement: real route responses, integration tests, behavior tests, or schema validation

Type generation passing is not enough if the actual response shape is still wrong.

### 6. Handle breaking changes explicitly

When a change is breaking:

- name it clearly
- update all in-repo consumers in the same batch when possible
- document migration assumptions briefly if external consumers may exist
- avoid silent partial compatibility unless the project truly needs a migration window

### 7. Close drift immediately

Before finishing:

- remove dead fields and deprecated consumer logic that no longer matches the contract
- update fixtures and mocks to the real shape
- make sure future generation checks will catch drift again

## Anti-Patterns

- Editing generated files directly
- Changing frontend types without updating the backend contract
- Shipping a contract change without updating fixtures or mocks
- Treating typecheck success as proof of runtime correctness
- Keeping compatibility branches "just in case" without a real migration plan
- Letting additive and breaking changes blend together without calling out the risk

## Expected Behavior When This Skill Is Used

When applying this skill to a task:

1. Identify the contract source of truth.
2. Change the contract there first.
3. Regenerate or refresh dependent artifacts.
4. Update all affected consumers.
5. Verify both runtime and type-level agreement.
6. Report any remaining compatibility risk briefly.
