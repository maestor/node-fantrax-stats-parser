# Codebase Reorganization Plan

**Date:** 2026-03-15
**Branch:** `refactor/reorganizing-codebase`
**Status:** Phase 5 completed, Phase 6 not started

## Goal

Reorganize `src/` so the root stops acting as the default landing area for new domain-specific files, while keeping the low-overhead workflow that fits this hobby project.

This is intentionally an iterative plan. The reorganization should happen in small, safe steps instead of one large move.

## Constraints and decisions

- Keep a centralized configuration surface in code. The current `constants.ts` role as a lightweight "settings page" is valid for this project.
- Keep a centralized import surface for shared types, but move feature-specific types closer to their feature over time.
- Keep `src/playwright/` where it is for now. It is already a clear boundary and there is no benefit in inventing a wider tooling folder yet.
- Prefer stable top-level folders in `src/` so new business features do not keep creating new root folders.
- Update `README.md`, `docs/DEVELOPMENT.md`, and `docs/TESTING.md` whenever the actual structure or workflow changes.

## Problem statement

Today `src/` mixes several concerns directly in the root:

- application/bootstrap files such as `index.ts`, `server.ts`, and `openapi.ts`
- broad shared buckets such as `constants.ts`, `types.ts`, `helpers.ts`, and `mappings.ts`
- domain-specific modules such as `transactions.ts`, `fantrax-entities.ts`, and `snapshots.ts`

That makes the root ambiguous. Once a few feature-specific files are placed there, future feature work naturally follows the same pattern and the root keeps growing.

## Target structure

```text
src/
  index.ts
  server.ts
  openapi.ts

  config/
    settings.ts
    csv.ts
    fantrax.ts
    index.ts

  features/
    stats/
      routes.ts
      service.ts
      scoring.ts
      mapping.ts
      types.ts
    career/
      routes.ts
      service.ts
      highlights.ts
      types.ts
    leaderboard/
      routes.ts
      service.ts
      types.ts
    transactions/
      files.ts
      types.ts
    fantrax/
      entities.ts
      types.ts

  db/
    client.ts
    queries.ts
    schema.ts

  infra/
    snapshots/
      store.ts
    r2/
      retry.ts

  playwright/
    ...

  shared/
    seasons.ts
    teams.ts
    http.ts
    types/
      core.ts
      index.ts
```

## Placement rules

### Root entrypoints

Keep `src/index.ts`, `src/server.ts`, and `src/openapi.ts` in the root. They are obvious entrypoints and do not create the same scaling problem as feature-specific modules.

The root should stay small and intentional: a few bootstrap files plus stable technical folders.

### `config/`

Centralized code-based settings. This replaces the "everything in one constants file" pattern with a few focused config files while keeping the same editing convenience.

Examples:

- league/team settings
- current season
- score weights
- CSV field mappings
- Fantrax URL constants

### `features/`

Primary home for business logic. New domain-specific functionality should land here by default so `src/` root stays stable.

Each feature should own as much of its code as practical, including routes, services, and feature-local types.

### `shared/`

High-bar shared modules only. If something clearly belongs to one feature, keep it there even if another module imports it.

This prevents `shared/` from becoming the next `helpers.ts`.

### `playwright/`

Keep as-is for now. It is local scraping/import tooling, clearly documented, and currently does not benefit from a broader tooling hierarchy.

## Proposed file mapping

- `src/index.ts` -> keep in `src/`
- `src/server.ts` -> keep in `src/`
- `src/openapi.ts` -> keep in `src/`
- `src/constants.ts` -> split across `src/config/` and `src/shared/http.ts`
- `src/types.ts` -> split across `src/shared/types/` and feature-local `types.ts`
- `src/helpers.ts` -> split across `src/features/stats/` and `src/shared/`
- `src/mappings.ts` -> primarily `src/features/stats/mapping.ts`
- `src/services.ts` -> split under `src/features/stats/`, `src/features/career/`, and `src/features/leaderboard/`
- `src/routes.ts` -> split under the same feature folders
- `src/transactions.ts` -> `src/features/transactions/files.ts`
- `src/fantrax-entities.ts` -> `src/features/fantrax/entities.ts`
- `src/snapshots.ts` -> `src/infra/snapshots/store.ts`
- `src/r2/retry.ts` -> keep the same logic, but align under `src/infra/r2/retry.ts` when surrounding moves happen

## Iteration plan

### Phase 0: Planning and tracking

- [x] Create this plan document
- [x] Remove the stale tracked `career-highlights` plan document
- [x] Add a README roadmap item that links to this plan and carries the current status

### Phase 1: Stabilize import surfaces

- [x] Add `src/config/index.ts` and `src/shared/types/index.ts` as stable import surfaces
- [x] Keep `src/constants.ts` and `src/types.ts` temporarily as compatibility barrels or thin re-export layers
- [x] Avoid behavior changes in this phase

### Phase 2: Split centralized config and shared types

- [x] Move project settings from `src/constants.ts` into focused config modules
- [x] Move cross-feature types into `src/shared/types/`
- [x] Move feature-local types beside their feature code
- [x] Keep call sites working through the temporary barrels until the migration is complete

### Phase 3: Split `helpers.ts` and `mappings.ts`

- [x] Move scoring logic into `src/features/stats/scoring.ts`
- [x] Move CSV mapping logic into `src/features/stats/mapping.ts`
- [x] Move season/team utility logic into `src/shared/`
- [x] Keep `src/helpers.ts` and `src/mappings.ts` as temporary compatibility barrels until later phases migrate call sites fully

### Phase 4: Split `services.ts` and `routes.ts`

- [x] Create feature-owned `routes.ts` and `service.ts` files under `stats`, `career`, and `leaderboard`
- [x] Keep route registration/composition in `src/index.ts`
- [x] Keep `src/services.ts` and `src/routes.ts` as stable root entrypoints while feature modules take over the implementation

### Phase 5: Move feature-specific root modules

- [x] Move transactions helpers under `src/features/transactions/`
- [x] Move Fantrax entity registry helpers under `src/features/fantrax/`
- [x] Move snapshot storage under `src/infra/snapshots/`
- [x] Keep `src/transactions.ts`, `src/fantrax-entities.ts`, and `src/snapshots.ts` as temporary compatibility barrels until the final cleanup phase

### Phase 6: Cleanup and finalize

- [ ] Remove temporary barrel compatibility layers once imports are fully migrated
- [ ] Update README and development/testing docs to match the final structure
- [ ] Remove this plan document after the reorganization is fully complete

## Per-phase rules

- Keep each implementation step small enough to review independently
- Finish each completed phase with its own commit before starting the next phase
- Prefer moves without behavior changes first, then cleanup
- Run `npm run verify` before any commit that changes code or docs in a meaningful way
- Update the README roadmap item whenever phase status changes
- Update `docs/DEVELOPMENT.md` and `docs/TESTING.md` whenever folder structure or testing guidance changes materially

## Success criteria

- `src/` root stays small, with only obvious entrypoints plus stable technical buckets
- new business features default to `src/features/` instead of creating new root modules
- centralized project settings remain easy to edit in code
- shared types still have a convenient central import surface
- Playwright scraping stays clearly isolated without unnecessary restructuring
