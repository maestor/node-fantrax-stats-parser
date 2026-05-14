---
name: project-documentation
description: Use when creating, restructuring, or updating repository documentation so README, docs pages, contributor guidance, commands, environment setup, testing expectations, architecture notes, and deployment or operations docs stay concise, project-specific, and aligned with actual frontend, backend, mobile, or split-repo workflows.
---

# Project Documentation

## Overview

Use this skill when a repository needs documentation that stays useful during normal engineering work instead of becoming a separate maintenance burden.

The goal is to keep project docs:

- easy to enter through one clear starting point
- specific to the actual repository, not generic framework teaching
- honest about commands, environments, architecture, and verification
- updated in the same change when behavior or workflow changes
- shaped appropriately for frontend, backend, mobile, or paired UI/API repos

Read [references/documentation-checklist.md](./references/documentation-checklist.md) when deciding which docs belong in a repo or which files must be updated for a given change.

## Core Rules

- Prefer one clear documentation entrypoint before adding more files.
- Keep README focused on orientation, setup, core commands, and where deeper docs live.
- Put detailed workflows in `docs/` once they become too large or too specific for README.
- Document repository-specific truths, not generic React, Angular, Expo, Node, or framework tutorials.
- Keep commands, environment variables, ports, URLs, and deployment details concrete.
- When a repo depends on a sibling repo, name that relationship explicitly.
- Update docs in the same task when code changes affect behavior, commands, contracts, testing, deployment, or contributor workflow.
- Prefer concise sections and strong cross-links over long duplicated explanations.
- If a fact is enforced by code, config, or scripts, document the rule without drifting from the real source of truth.
- Call out known local exceptions, shortcuts, and operational caveats that would otherwise slow the next contributor down.

## Token Discipline

- Do not rewrite an entire documentation set when only one workflow changed.
- Summarize repeated patterns once, then link to the deeper file.
- Keep change reports short:
  - entrypoints updated
  - workflow or command drift fixed
  - new docs added only if they close a real gap
  - any remaining documentation debt
- Expand only when structure, rollout, or migration impact is non-obvious.

## Workflow

### 1. Identify the documentation surfaces

Map the current documentation entrypoints:

- `README.md`
- `docs/README.md` if present
- topic guides under `docs/`
- `AGENTS.md`, `CLAUDE.md`, or project-local skill docs
- generated API docs such as OpenAPI or Swagger

Find where contributors are expected to start and whether that path is still obvious.

### 2. Identify the repo type and audience

Determine what this repository actually is:

- web frontend
- mobile app
- backend or API
- data/import pipeline
- paired UI or API repo in a multi-repo system

Also identify the main readers:

- maintainers
- new contributors
- AI coding agents
- deployers or operators
- consumers of the API or app

The docs should optimize for the real readers, not for an imaginary generic audience.

### 3. Keep README as the orientation layer

A strong README usually answers:

- what this project is
- what it connects to
- how to run it locally
- which commands matter most
- where the detailed docs live

README should help someone become oriented quickly. It should not become a dumping ground for every implementation detail.

### 4. Move depth into focused docs

When the project has enough complexity, split topic-specific guidance into focused files such as:

- development workflow
- testing and verification
- architecture or project structure
- deployment and operations
- importing or data sync workflows
- accessibility, design system, or UI conventions
- agent or contributor workflow

Each deeper doc should have a clear reason to exist and a stable link from the main entrypoint.

### 5. Match the doc set to the repository type

Different repos need different depth:

- frontend and mobile repos often need setup, UI conventions, testing, accessibility, theming, and API-integration notes
- backend repos often need runtime overview, environment variables, migrations, import jobs, API shape, auth, deployment, and operations notes
- split UI/API projects should cross-link each other and clearly describe the boundary between them

Use [references/documentation-checklist.md](./references/documentation-checklist.md) to choose the smallest honest doc set.

### 6. Update docs when code changes create drift

Documentation updates are required when changes affect:

- commands
- ports, URLs, or environment variables
- repo structure or important directories
- API contracts or generated type workflows
- test strategy, coverage gates, or verification commands
- deployment, auth, caching, or data import behavior
- accessibility, theming, navigation, or other contributor-facing UI rules

Do not leave docs behind and call it follow-up work unless the user explicitly chooses that tradeoff.

### 7. Keep docs concrete and skimmable

Prefer:

- real commands
- real file paths
- real ports and URLs
- short sections with descriptive headings
- explicit links between related docs

Avoid vague phrases like "configure as needed" when the repository already knows what is needed.

### 8. Close the loop before finishing

Before considering the work done:

- check that README still points to the right deeper docs
- remove or fix stale command examples
- ensure new files are linked from an obvious entrypoint
- make sure frontend/backend counterpart links still work
- report any remaining documentation gap explicitly

## Anti-Patterns

- README that tries to explain the entire codebase with no deeper structure
- many docs files with no obvious starting point
- generic framework tutorials copied into repo docs
- command lists that no longer match `package.json` or scripts
- environment variable sections that omit required values or local defaults
- frontend docs that hide the backend dependency
- backend docs that never explain auth, contracts, data sources, or operational flows
- documenting desired architecture instead of the current one
- leaving docs stale after changing workflows because "the code is obvious"

## Expected Behavior When This Skill Is Used

When applying this skill to a task:

1. Find the real docs entrypoints and repo type.
2. Keep README as the fast orientation layer.
3. Move complexity into focused docs only when it earns its own file.
4. Update docs in the same change whenever workflow or behavior drift appears.
5. Keep instructions concrete, project-specific, and cross-linked.
