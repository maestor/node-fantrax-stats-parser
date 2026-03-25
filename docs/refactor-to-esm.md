# Incremental CommonJS-to-ESM Refactor Plan

**Status:** In progress
**Date:** 2026-03-25
**Branch:** `refactor/commonjs-to-esm`
**Progress:** Canonical app entrypoint extracted to `src/app.ts`; `src/index.cts` is now the explicit CommonJS compatibility wrapper. `micro` and `micro-cors` have been replaced by local HTTP/CORS helpers, the source tree now uses explicit ESM-ready relative specifiers, and the dependency cleanup has started by moving Playwright to `devDependencies` and removing unused `@types/express`.

## Goals

- Move the project from package-level CommonJS to package-level ESM in reviewable phases.
- Keep the HTTP API behavior and Vercel deployment shape stable during the migration.
- Reduce long-term runtime surface area by removing compatibility dependencies we can own locally.
- Keep the production bundle lean and keep script-only tooling out of runtime dependencies where practical.
- Prefer a single final runtime target instead of maintaining dual CommonJS + ESM outputs.

## Non-goals

- Do not rewrite the API into a new framework as part of this migration.
- Do not redesign route semantics, scoring behavior, or database behavior.
- Do not mix this work with unrelated refactors unless they directly unblock ESM.
- Do not commit to long-term dual publishing; this repo is private and deployed on Vercel, so one stable ESM target is easier to maintain.

## Original baseline

The notes below capture the state when this migration plan was first written.

- `tsconfig.json` already uses `module: "nodenext"` and `moduleResolution: "nodenext"`.
- `package.json` is still `"type": "commonjs"`, so build output under `lib/` is CommonJS today.
- `src/index.ts` still ends with `module.exports = ...`.
- `src/server.ts`, `api/index.ts`, and `api/[...path].ts` still use `require(...)`.
- `src/openapi.ts` still depends on `__dirname`.
- Most relative imports are extensionless, which is fine for CommonJS output but not the final ESM target.
- Tests currently run through Jest + `ts-jest` with `NODE_OPTIONS=--experimental-vm-modules`.
- `playwright` is in runtime `dependencies` even though it is only used by local importer tooling.
- `csvtojson` is only used by scripts, not by the production API runtime.

## Dependency decisions

| Package / area | Decision | Why |
| --- | --- | --- |
| `rou3` | Keep | Already lightweight and ESM-friendly. |
| `@libsql/client` | Keep | Core runtime dependency. |
| `js-yaml` | Keep for now | Used in the OpenAPI route and not the main migration blocker. |
| `micro` | Replace | Removes CommonJS-centric runtime coupling and lets us own small response helpers directly. |
| `micro-cors` | Replace | Tiny behavior surface that is simpler to own than to keep as a legacy compatibility dependency. |
| `csvtojson` | Replace with `csv-parse` | Scripts only, and `csv-parse` is a better long-term fit for ESM-oriented Node tooling. |
| `playwright` | Move to `devDependencies` | Local importer only; keeping it out of runtime deps helps deployment size and maintenance. |
| `jest` + `ts-jest` | Keep initially, re-evaluate later | Large suite; treat test-runner migration as a separate decision once runtime ESM is stable. |
| `nodemon` + `concurrently` | Replace later with `tsx watch` | The repo already uses `tsx`, so the dev loop can be simplified after the runtime flip. |
| `@types/express` | Remove if still unused | Not part of the current runtime and appears to be leftover tooling debt. |

## Recommended phase order

### Phase 0: Lock current behavior and trim obvious dependency debt

**Purpose:** make later runtime changes safer and reduce needless production weight early.

**Progress note (2026-03-25):** partly done. `playwright` has been moved to `devDependencies`, and the unused `@types/express` package has been removed.

**Tasks**

- Confirm current route coverage around `/health`, `/api/health`, `/openapi.json`, `/api-docs`, auth failures, and Vercel path normalization still has tests or smoke checks.
- Move clearly local-only packages to `devDependencies` first:
  - `playwright`
  - `csvtojson` if we do not replace it in the same phase
- Remove `@types/express` if it is still unused after a quick dependency audit.
- Keep this phase behavior-neutral; no ESM flip yet.

**Validation**

- `npm run verify`
- Smoke-check the local server plus a Vercel preview deployment

### Phase 1: Extract a canonical app entrypoint

**Purpose:** stop tying local server boot, Vercel handlers, and test imports to the export style of `src/index.ts`.

**Progress note (2026-03-25):** done for the first slice. `src/app.ts` now owns the composed handler, and `src/server.ts`, `api/index.ts`, `api/[...path].ts`, and the app-level tests point to it.

**Tasks**

- Introduce a canonical runtime entry such as `src/app.ts` or `src/http/app.ts`.
- Export the composed request handler, `getHealthcheck`, and any route metadata from that file.
- Make `src/index.ts` a thin compatibility layer or remove it once imports are updated.
- Update these callers to consume the canonical app module instead of depending on `module.exports` shape:
  - `src/server.ts`
  - `api/index.ts`
  - `api/[...path].ts`
  - tests importing the app entry
- Prefer ESM source syntax (`import` / `export`) even if the package still emits CommonJS at this stage.

**Validation**

- `npm run verify`
- Local smoke check for root and `/api/*` routes
- Vercel preview check before merging

### Phase 2: Remove `micro` and `micro-cors`

**Purpose:** remove two migration blockers without changing the route contract.

**Progress note (2026-03-25):** done for the second slice. Runtime response handling now goes through local helpers under `src/http/`, router-level CORS is handled in-repo, and `micro` / `micro-cors` have been removed from production dependencies.

**Tasks**

- Replace `micro.send` with small local helpers, for example:
  - `sendJson(res, status, body)`
  - `sendText(res, status, body)`
  - `sendEmpty(res, status)` if useful
- Replace `micro.serve` with a plain `http.createServer((req, res) => app(req, res))`.
- Replace `micro-cors` with a small local CORS wrapper inside `src/router.ts` or a dedicated HTTP utility module.
- Keep the current `IncomingMessage` / `ServerResponse` handler shape for now.
- Update route/auth/OpenAPI tests so they no longer mock `micro` or `micro-cors`.
- Remove `micro` and `micro-cors` from `dependencies` once the code is green.

**Validation**

- `npm run verify`
- Compare headers and status codes on:
  - success responses
  - auth failures
  - `OPTIONS` requests
  - cached `304` responses

### Phase 3: Make the source tree ESM-ready while output is still CommonJS

**Purpose:** land the largest mechanical changes before the package-level runtime flip.

**Progress note (2026-03-25):** in progress. Relative imports now use explicit runtime specifiers, and the old `src/index.ts` CommonJS wrapper has been isolated as `src/index.cts` with `package.json.main` pointing to `lib/index.cjs`.

**Tasks**

- Convert relative imports in `src/`, `scripts/`, `api/`, and `src/__tests__/` to explicit `.js` specifiers.
- Replace remaining `require(...)`, `module.exports`, and `exports.*` in TypeScript source with `import` / `export`.
- Keep true CommonJS config islands as `.cjs` where needed.
- Avoid mixing semantic refactors into this phase; this should be largely mechanical.
- Keep `package.json` as `"type": "commonjs"` until this phase is green.

**Validation**

- `npm run typecheck`
- `npm run verify`
- `rg -n "\\brequire\\(|module\\.exports|exports\\." src scripts api`

### Phase 4: Flip the package runtime to ESM

**Purpose:** make ESM the real runtime target only after the codebase already looks ESM-native.

**Tasks**

- Change `package.json` from `"type": "commonjs"` to `"type": "module"`.
- Rename `jest.config.js` to `jest.config.cjs` before the flip.
- Rename or isolate any other files that must stay CommonJS.
- Replace remaining `__dirname` / `__filename` patterns with `import.meta.url` plus `new URL(...)` or `fileURLToPath(import.meta.url)`.
- Review `main` and add a minimal `exports` field only if it adds clarity; do not overdesign package publishing for a private repo.
- Inspect compiled output under `lib/` and ensure it is emitting ESM imports/exports instead of generated `require(...)`.
- Keep the current Vercel routing model and `vercel.json` behavior intact during this phase.

**Validation**

- `npm run verify`
- Vercel preview deployment must pass
- Smoke-check both root and `/api/*` routes after deploy

**Stop condition**

- If Jest becomes the critical path because of ESM semantics, pause here and decide whether to:
  - configure Jest more explicitly for ESM, or
  - move to the dedicated test-runner follow-up phase sooner

### Phase 5: Clean up script and import-pipeline dependencies

**Purpose:** finish the migration around local tooling without coupling it to the production runtime flip.

**Tasks**

- Replace `csvtojson` with `csv-parse`.
- Keep the parsing logic behind a small local wrapper so the import pipeline is not tightly coupled to a parser API again.
- Update any script tests or import-path tests that depend on parser behavior.
- Confirm all `scripts/*.ts` and Playwright utilities still run through `tsx` after the package flip.
- Keep `dotenv` and other script-only packages in `devDependencies`.

**Validation**

- `npm run verify`
- Run the affected script flows locally against representative CSV files

### Phase 6: Simplify the local dev loop

**Purpose:** remove now-redundant dev-only process glue after ESM is stable.

**Tasks**

- Replace the current build/watch chain based on `concurrently` + `nodemon` with `tsx watch` if it is good enough for this repo.
- Keep `npm run build` on plain `tsc` for production output.
- Remove `nodemon` and `concurrently` if the new loop is stable.
- Re-check docs so local start instructions match the new workflow.

**Validation**

- `npm run dev`
- Edit a route file locally and confirm reload behavior is reliable

### Phase 7: Optional dedicated test-runner migration

**Purpose:** improve long-term ESM ergonomics without blocking the main runtime migration.

**Tasks**

- Only start this phase after package-level ESM is already stable in CI and on Vercel.
- Evaluate Vitest as the preferred replacement if Jest remains awkward in ESM mode.
- Migrate test globals, mocks, and setup deliberately rather than mixing them into runtime changes.
- Remove `jest`, `ts-jest`, and `@types/jest` only in a dedicated follow-up PR.

**Why optional**

- The runtime can reach ESM before the test runner is replaced.
- The suite is large and mock-heavy enough that this deserves its own review cycle.

## Recommended PR / commit slicing

1. `Docs: Add phased CommonJS-to-ESM roadmap`
2. `Refactor: Extract canonical app entrypoint`
3. `Refactor: Replace micro runtime helpers with local HTTP utilities`
4. `Refactor: Make imports ESM-ready while keeping CommonJS output`
5. `Refactor: Flip package runtime to ESM`
6. `Chore: Replace csvtojson with csv-parse and move script-only deps`
7. `Chore: Simplify dev loop with tsx watch`
8. `Test: Evaluate Vitest migration for long-term ESM support` if needed

## Final acceptance criteria

- `package.json` is `"type": "module"`.
- `src/`, `scripts/`, and `api/` no longer contain runtime `require(...)` or `module.exports`.
- Relative imports are explicit and ESM-safe.
- Runtime dependencies no longer include `micro`, `micro-cors`, `playwright`, or `csvtojson`.
- `npm run verify` passes.
- A Vercel preview deployment passes and serves both root-style and `/api/*` URLs correctly.
- The HTTP API behavior remains unchanged for consumers.

## Review questions

- Should the test-runner migration stay optional, or do we want to make Vitest part of the same modernization epic once the runtime flip starts?
- Do we want to keep the current `IncomingMessage` / `ServerResponse` contract long-term, or treat a later move to Web `Request` / `Response` as a separate post-ESM improvement?
