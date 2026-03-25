# TypeScript 6 Upgrade Plan

**Last reviewed:** 2026-03-25
**Branch:** `upgrading/typescript`

## Goal

Upgrade the current backend codebase from TypeScript 5.9 to TypeScript 6 with no intended runtime behavior changes and a green verification path.

## Current State

- Node engine is `>=24 <25`
- `package.json` uses `"type": "module"` and `exports`
- runtime app entry is `src/app.ts`
- router implementation uses `rou3`
- server entry is `src/server.ts`
- Vercel adapters live in:
  - `api/index.ts`
  - `api/[...path].ts`
- main compiler config uses:
  - `module: "nodenext"`
  - `moduleResolution: "nodenext"`
- production build uses `tsconfig.build.json`
- tests use `jest.config.cjs` + `ts-jest`
- tests have a dedicated `tsconfig.test.json`
- TypeScript is currently `^5.9.3`

## TS 6 Verification Snapshot

On 2026-03-25, `npm view typescript` reported:

- `latest: 6.0.2`

The current codebase was dry-run against the real TS 6 compiler.

### Main typecheck

Command:

```bash
npx -p typescript@6.0.2 tsc -p tsconfig.json --noEmit --pretty false
```

Current result:

- fails because Jest globals are no longer discovered automatically under TS 6

Verified fix:

```bash
npx -p typescript@6.0.2 tsc -p tsconfig.json --noEmit --pretty false --types node,jest
```

Result:

- passes

### Production build

Command:

```bash
npx -p typescript@6.0.2 tsc -p tsconfig.build.json --pretty false --outDir /tmp/ts6-build-current
```

Current result:

```text
error TS5011: The common source directory of 'tsconfig.build.json' is './src'. The 'rootDir' setting must be explicitly set to this or another path to adjust your output's file layout.
```

Verified fix:

```bash
npx -p typescript@6.0.2 tsc -p tsconfig.build.json --pretty false --rootDir ./src --outDir /tmp/ts6-build-current-fixed
```

Result:

- passes

### Test config

Command:

```bash
npx -p typescript@6.0.2 tsc -p tsconfig.test.json --noEmit --pretty false
```

Current result:

- fails because `moduleResolution: "node"` is deprecated in TS 6

Verified fix:

```bash
npx -p typescript@6.0.2 tsc -p tsconfig.test.json --noEmit --pretty false --moduleResolution bundler --types node,jest
```

Result:

- passes

Alternative also verified:

```bash
npx -p typescript@6.0.2 tsc -p tsconfig.test.json --noEmit --pretty false --module node16 --moduleResolution node16 --types node,jest
```

Result:

- passes

## What Still Needs To Change

### 1. Add explicit types to `tsconfig.json`

Current issue:

- `tsconfig.json` includes the test tree
- TS 6 no longer picks up Jest globals implicitly for this config

Recommended change:

- add `types: ["node", "jest"]`

Why:

- smallest fix
- already verified by dry run
- keeps `npm run typecheck` behavior unchanged

### 2. Add explicit `rootDir` to `tsconfig.build.json`

Current issue:

- TS 6 requires `rootDir` to be explicit for this build layout

Recommended change:

- set `rootDir: "./src"`

Why:

- keeps emitted layout aligned with the current runtime expectation around `lib/server.js`
- already verified by dry run

### 3. Update `tsconfig.test.json`

Current issues:

- `moduleResolution: "node"` is deprecated in TS 6
- Jest globals are still implicit

Recommended minimal change:

- keep `module: "commonjs"`
- change `moduleResolution` to `"bundler"`
- add `types: ["node", "jest"]`

Why this is the preferred option:

- it is the smaller change
- it already passed a TS 6 dry run
- it keeps the current `ts-jest` bridge closest to today's behavior

Fallback option:

- switch test config to `module: "node16"` and `moduleResolution: "node16"`

That also compiles under TS 6, but it is a larger change and should only be used if Jest pushes us there.

### 4. Upgrade TypeScript itself

Recommended change:

- bump `typescript` from `^5.9.3` to `^6.0.2`
- refresh the lockfile

## Tooling Risk

### `typescript-eslint`

Current registry state:

```text
typescript-eslint 8.57.2
peerDependencies.typescript: >=4.8.4 <6.0.0
```

Implication:

- ESLint support is still officially behind TS 6

### `ts-jest`

Current registry state:

```text
ts-jest 29.4.6
peerDependencies.typescript: >=4.3 <6
```

Implication:

- tests may still work, but the current Jest transform path is not officially marked TS 6-compatible

### What this means

The codebase itself looks close to TS 6-ready.
The main remaining risk is not app code, but whether lint and test tooling tolerate TS 6 well enough for `npm run verify`.

## Recommended Order

### Phase 1: Config changes

1. Add `types: ["node", "jest"]` to `tsconfig.json`
2. Add `rootDir: "./src"` to `tsconfig.build.json`
3. Update `tsconfig.test.json` to:
   - keep `module: "commonjs"`
   - use `moduleResolution: "bundler"`
   - add `types: ["node", "jest"]`

### Phase 2: TypeScript bump

1. Upgrade `typescript` to `^6.0.2`
2. Refresh lockfile
3. Re-run:
   - `npm run typecheck`
   - `npm run build`

### Phase 3: Verification

1. Run `npm run lint:check`
2. Run `npm run test:coverage`
3. Run `npm run verify`

If failures are limited to `ts-jest` or `typescript-eslint` compatibility, treat that as a tooling decision, not a signal that the app code still needs refactoring.

### Phase 4: Runtime smoke

After TS 6 is installed and verification is green enough to trust:

1. Run `npm run dev`
2. Run `npm start`
3. Smoke:
   - `/healthcheck`
   - `/api-docs`
   - one API data route
4. Confirm Vercel adapters still dispatch correctly through:
   - `api/index.ts`
   - `api/[...path].ts`

## Success Criteria

The upgrade is complete when all of the following are true:

- TypeScript is upgraded to 6.x in `package.json`
- `npm run typecheck` passes without CLI-only overrides
- `npm run build` passes without CLI-only overrides
- `npm run verify` passes, or any remaining failures are explicitly understood as external tool support gaps
- `npm run dev` works
- `npm start` works
- Vercel adapters still route correctly

## Net Assessment

This is now a small, configuration-heavy upgrade.

The remaining work is:

- explicit Jest type discovery
- explicit build `rootDir`
- replacing deprecated test module resolution
- validating external tooling against TS 6

No router replacement work or ESM migration work remains in this plan.
