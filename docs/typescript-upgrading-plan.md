# TypeScript 6 Upgrade Plan

**Date:** 2026-03-25
**Branch:** `upgrading/typescript`

## Goal

Upgrade the backend project from TypeScript 5.9 to TypeScript 6 with no intended runtime behavior changes and a fully green `npm run verify`.

## Current Baseline

- Node engine is `>=24 <25`
- TypeScript is `^5.9.3`
- Compiler options currently include `module: "commonjs"`, `target: "es2022"`, `strict: true`, and `isolatedModules: true`
- Repo-wide typecheck uses one broad `tsconfig.json` for `src` and `scripts`
- Production build uses `tsconfig.build.json`
- Tests use Jest with `ts-jest`
- Linting uses `typescript-eslint`
- Routing stack uses `micro`, `micro-cors`, and `microrouter`
- Runtime scripts expect the compiled entrypoint at `lib/server.js`

## What Was Verified

On 2026-03-25, `npm view typescript` reported:

- `latest: 6.0.2`

The project was then dry-run against the real TS 6 compiler with `npx -p typescript@6.0.2 tsc`.

### Initial TS 6 diagnostics

1. Repo-wide typecheck failed because TS 6 now defaults `types` to `[]`, so Jest globals were no longer discovered automatically.
2. Build failed with:

```text
error TS5011: The common source directory of 'tsconfig.build.json' is './src'. The 'rootDir' setting must be explicitly set to this or another path to adjust your output's file layout.
```

3. After temporarily overriding `--types node,jest` and `--rootDir ./src`, the only remaining compiler error was:

```text
node_modules/url-pattern/index.d.ts(19,16): error TS1540: A 'namespace' declaration should not be declared using the 'module' keyword. Please use the 'namespace' keyword instead.
```

4. After also temporarily adding `--skipLibCheck`, both TS 6 typecheck and build passed.

## Main Conclusion

The backend source code itself looks close to TypeScript 6-ready.

The main upgrade risks are:

- TS 6 config changes that now require explicit setup
- legacy third-party typings in the routing stack
- test/lint tooling that still advertises TypeScript `<6` support ranges

## Confirmed Upgrade Work

### 1. Make `types` explicit

TS 6 defaults `types` to `[]`, which breaks this repo's current assumption that Node and Jest globals are discovered automatically.

This repo relies on:

- Node globals in app and scripts
- Jest globals across `src/__tests__`

**Planned action**

- Stop relying on implicit global type discovery
- Add explicit `types` settings
- Prefer separate configs so production build uses only Node types while test typecheck includes Jest types

**Recommended direction**

- `tsconfig.base.json`: shared compiler options
- `tsconfig.json`: repo-wide typecheck with `types: ["node", "jest"]`
- `tsconfig.build.json`: production build with `types: ["node"]`

### 2. Make `rootDir` explicit for the build

TS 6 now defaults `rootDir` to the directory containing the `tsconfig.json` file, instead of inferring a narrower common source root.

That matters here because the build scripts expect:

- `lib/server.js`
- not `lib/src/server.js`

**Planned action**

- Set `rootDir: "./src"` in the build config
- Keep `outDir: "./lib"` explicit
- Reconfirm that `npm start` and `npm run dev` still resolve `lib/server.js`

### 3. Stop relying on legacy `microrouter` type plumbing

The only remaining TS 6 compiler error after the config fixes comes from `url-pattern`, pulled in through `microrouter` and `@types/microrouter`.

The routing surface used by this repo is fairly small and concentrated mostly in:

- `src/index.ts`
- `src/shared/route-utils.ts`
- route modules that consume `AugmentedRequestHandler`

**Planned action**

Choose one of these approaches:

1. Preferred short-term option: add a small local declaration shim for the `microrouter` types the repo actually uses, so TS 6 no longer reads the broken legacy declaration from `url-pattern`
2. Temporary workaround: enable `skipLibCheck` during the upgrade spike only
3. Longer-term cleanup: replace `microrouter` with a maintained router or a tiny in-repo router abstraction

**Recommendation**

Use a local shim first. It is the smallest change with the lowest runtime risk.

### 3a. Best lightweight `microrouter` replacement options

If we decide that patching around `microrouter` is not enough, the replacement should stay small, Node-friendly, and easy to maintain.

#### What this backend actually needs

- direct compatibility with Node `IncomingMessage` / `ServerResponse`
- path params like `:id` and a simple catch-all / fallback route
- low dependency weight
- built-in TypeScript support or very small typing surface
- a maintainer story that looks healthier than the current `microrouter` + `url-pattern` setup

#### Option 1: `find-my-way` (best default replacement)

**Why it is attractive**

- actively maintained
- built-in TypeScript declarations
- designed for plain Node HTTP servers
- framework independent
- battle-tested through real production usage in the Fastify ecosystem
- supports params, wildcards, and a straightforward default route

**Tradeoffs**

- more capable than this project strictly needs
- a slightly larger API surface than tiny micro-routers

**Why it fits this repo**

This is the best option if we want a small but serious router without changing the backend architecture much. It works naturally with the current Node request/response model and should be easier to trust long-term than `microrouter`.

#### Option 2: `rou3` (best tiny modern option)

**Why it is attractive**

- very small
- zero dependencies
- built-in TypeScript declarations
- actively maintained
- simple route insertion and matching API

**Tradeoffs**

- more low-level than `find-my-way`
- we would probably want a thin in-repo adapter to preserve the current handler shape

**Why it fits this repo**

This is a strong option if we want the dependency surface to stay minimal and are comfortable owning a tiny wrapper around route matching ourselves.

#### Option 3: `trouter` (acceptable, but less compelling)

**Why it is attractive**

- small and simple
- built-in TypeScript declarations
- familiar route declaration API

**Tradeoffs**

- looks less actively maintained than the top two options
- not as naturally centered on plain Node request/response lookup as `find-my-way`

**Why it fits this repo**

It could work, but it is harder to justify over `find-my-way` or `rou3` unless we strongly prefer its API style.

#### Not a top fit: `itty-router`

`itty-router` is small and maintained, but it is much more fetch/serverless-oriented. For this backend, that means extra adaptation work without a clear payoff, so it is not a first-choice replacement.

#### Replacement recommendation

If we replace `microrouter`, the order of preference should be:

1. `find-my-way` if we want the safest small maintained router with direct Node compatibility
2. `rou3` if we want the lightest modern option and are happy to own a tiny adapter layer
3. `trouter` only if we decide its API shape is a better fit than its maintenance profile suggests

For the TS 6 upgrade specifically, replacing the router is still a larger move than adding a local type shim. The most conservative path is:

1. use a local shim to get unblocked on TS 6
2. only then evaluate whether a router replacement is still worth doing

### 4. Reevaluate `typescript-eslint`

The currently installed `typescript-eslint` package advertises a peer range of:

```text
typescript: >=4.8.4 <6.0.0
```

That means the repo may become compiler-clean before linting is officially supported.

**Planned action**

- Check whether the current lint setup still works in practice with TS 6
- If it works, treat it as temporarily unsupported and monitor for an officially compatible release
- If it fails, either:
  - wait for official support, or
  - upgrade/replace the lint integration when a TS 6-compatible path is available

### 5. Reevaluate `ts-jest`

The currently installed `ts-jest` package advertises a peer range of:

```text
typescript: >=4.3 <6
```

This is the biggest likely blocker for `npm run verify`, because the compiler can be ready while the Jest transform pipeline is still officially behind.

**Planned action**

- Test whether the current Jest setup still runs under TS 6 in practice
- If it works, decide whether unsupported-but-working is acceptable
- If it fails, plan a dedicated migration away from `ts-jest`

**Fallback options if `ts-jest` blocks the upgrade**

- Wait for an official TS 6-compatible `ts-jest` release
- Switch Jest to a different TS transform path
- Keep TypeScript pinned at 5.9 until the test toolchain catches up

### 6. Freeze compiler defaults that may drift in TS 6

The project already sets `module: "commonjs"` explicitly, which is good.

However, the repo still relies on some inferred compiler behavior, especially around module resolution.

**Planned action**

- Make TS 6-sensitive compiler behavior explicit instead of relying on defaults
- Review `moduleResolution` deliberately during the upgrade rather than inheriting TS 6 default behavior accidentally

**Reason**

This backend targets Node directly, so silent resolution changes are riskier than in a bundled frontend app.

## Major Bottlenecks

### High risk

- `ts-jest` currently declares TypeScript `<6` support only
- `typescript-eslint` currently declares TypeScript `<6` support only

These may block `npm run verify` even if the compiler itself is happy.

### Medium risk

- `microrouter` depends on legacy typings that TS 6 now rejects

This is probably solvable locally, but it must be handled before a clean TS 6 migration is complete.

### Low risk

- TS 6 config changes around `types` and `rootDir`

These are straightforward, confirmed, and localized.

## Recommended Implementation Order

### Phase 1: Compiler compatibility

1. Bump `typescript` to `^6.0.2`
2. Split or tighten tsconfig responsibilities
3. Add explicit `types`
4. Add explicit `rootDir` for build
5. Make TS 6-sensitive options explicit where needed
6. Re-run `npm run typecheck` and `npm run build`

### Phase 2: Router typing compatibility

1. Remove the `url-pattern` type blocker with a local shim or equivalent
2. Re-run TS 6 typecheck/build without temporary workarounds
3. Avoid leaving `skipLibCheck` enabled unless we make that tradeoff consciously

### Phase 3: Toolchain compatibility

1. Validate ESLint under TS 6
2. Validate Jest and `ts-jest` under TS 6
3. If either fails, decide whether to:
   - wait for ecosystem support
   - replace the blocking tool
   - postpone the final upgrade

### Phase 4: Full verification and runtime smoke

1. Run `npm run verify`
2. Run `npm start`
3. Run `npm run dev`
4. Smoke-check at least:
   - `/healthcheck`
   - `/api-docs`
   - one data route such as `/players/combined/regular`

## Success Criteria

The upgrade is complete only when all of the following are true:

- TypeScript is upgraded to 6.x in `package.json`
- Typecheck passes without temporary CLI-only overrides
- Build emits the expected runtime layout
- `npm run verify` passes
- Dev and start flows still boot correctly
- No permanent workaround is accepted accidentally

## Explicit Decision Points

### Decision 1: Is unsupported-but-working acceptable?

If ESLint and Jest work under TS 6 despite their current peer ranges, decide whether the project is comfortable shipping that state temporarily.

### Decision 2: Do we patch around `microrouter`, or replace it?

Because the routing API surface in this repo is small, a local shim is likely the fastest path. A router replacement should be treated as a separate modernization task unless more hidden problems appear.

### Decision 3: Is `skipLibCheck` acceptable?

The TS 6 spike proved that the repo-owned code compiles once external library noise is bypassed. That makes `skipLibCheck` a useful diagnostic tool, but it should not become the default unless we intentionally choose that tradeoff.

## Recommended Outcome

Proceed with a two-step strategy:

1. Make the codebase and configs TS 6 compiler-clean
2. Only then decide whether the remaining lint/test toolchain is ready enough for a full project upgrade
