# Project Documentation Checklist

Use this checklist to decide which documentation files belong in a repository and which existing docs must be updated after a change.

## Core Principles

- README is the entrypoint, not the whole knowledge base.
- Prefer a small doc set that is current over a large doc set that drifts.
- Keep docs project-specific and operationally useful.
- Cross-link related docs instead of duplicating the same instructions.
- If a repo has a sibling UI/API/mobile/backend repository, state the relationship clearly.

## README Baseline

Most repos should keep these in `README.md`:

- project purpose and scope
- linked sibling repo or live deployment if one matters
- quick local start or setup
- most important commands
- doc index for deeper topics
- concise technology or architecture summary when useful

README can also include:

- feature summary for product-facing apps
- API overview for backend repos
- environment overview when setup is otherwise confusing
- contributor expectations if they are short and central

Move detailed command explanations, long architecture notes, or operational runbooks into `docs/`.

## Docs Directory Baseline

Add topic docs only when the topic is substantial enough to deserve its own stable link.

Common files:

- `docs/README.md`
  Use when `docs/` contains enough files that contributors need a docs index.
- `docs/development.md` or `docs/DEVELOPMENT.md`
  Local setup, workflow, commands, conventions, project structure.
- `docs/testing.md` or `docs/TESTING.md`
  Test strategy, verification expectations, fixture or mock rules, coverage gates.
- `docs/deployment.md` or `docs/DEPLOYMENT.md`
  Hosting, secrets, environments, rollout, operational checks.
- `docs/architecture.md`
  Only when the project has enough moving parts that structure and boundaries are otherwise hard to infer.
- `docs/accessibility.md`
  Useful when accessibility rules are central to UI work.
- `docs/versioning.md`
  Useful for Expo/mobile release flow, app version policy, or API versioning.
- `docs/importing.md`
  Useful for scrapers, import pipelines, seed data, or sync workflows.
- `docs/agent_skills.md` or `docs/AGENT_SKILLS.md`
  Useful when the repo relies on project-local skills or explicit AI workflow rules.

Keep topic docs narrowly scoped. If two files explain nearly the same workflow, combine them.

## Frontend and Web UI Repos

Usually document:

- backend dependency and base URL expectations
- environment variables
- core dev, build, test, and verify commands
- route or feature overview when product scope is not obvious
- testing strategy
- accessibility or design-system rules when they materially affect contributions
- API type generation or contract-sync workflow when typed clients are generated
- deployment or hosting notes if the frontend proxies auth or API traffic

Good deeper docs for frontend repos often include:

- development workflow
- testing
- styling or theming guide
- accessibility guide
- architecture or project overview

## Mobile Repos

Usually document:

- simulator or device assumptions
- Expo or native tooling prerequisites
- environment variable flow for local and cloud builds
- API dependency and generated type workflow
- versioning and release/update flow
- platform-specific debugging notes when they are recurring

## Backend and API Repos

Usually document:

- runtime purpose and data sources
- quick start, migrations, and import/bootstrap flow
- required and optional environment variables
- auth expectations
- key routes or where the generated API docs live
- verification commands and test strategy
- deployment/runtime target
- cache, snapshot, import, or operations workflow when applicable

Good deeper docs for backend repos often include:

- development
- testing
- deployment
- importing or sync workflows
- snapshots, caching, or data-pipeline notes

## Paired UI and API Repos

When frontend and backend live separately:

- link each repo from the other
- explain the contract boundary
- describe how local URLs and auth work between them
- document generated client/type workflows from the backend contract
- state clearly which repo is the source of truth for API shape

## Documentation Update Triggers

Update docs when a change affects:

- local startup steps
- commands or scripts
- environment variables
- API routes, auth, or contract generation
- project structure that contributors rely on
- test strategy or quality gates
- deployment configuration
- data import or sync flow
- accessibility, theming, navigation, or major UX conventions
- sibling-repo integration points

If the change only affects internal implementation and no contributor-facing workflow or behavior changed, docs may not need updates.

## Review Questions

Before finishing documentation work, ask:

- Can a new contributor find the right starting point quickly?
- Does README explain what the repo is and how it fits into the system?
- Are the most important commands accurate?
- Are required environment variables concrete and current?
- Do docs still match the actual test and deployment workflow?
- Is there duplication that will drift?
- Are deeper docs linked from an obvious place?
