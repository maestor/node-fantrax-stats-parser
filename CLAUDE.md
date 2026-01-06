# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript-based API that parses NHL fantasy league stats from CSV files exported from Fantrax. The API provides endpoints to retrieve player and goalie statistics for individual seasons or combined across all seasons (starting from 2012-13). Built with micro (lightweight HTTP server) and csvtojson for parsing.

## Commands

### Development

- `npm run dev` - Build and run with watch mode (compiles TypeScript on changes and runs micro server)
- `npm run dev-start` - Build and run once without watch mode
- `npm run build` - Compile TypeScript to lib/ directory
- `npm start` - Production build and start

### Code Quality

- `npm run lint` - Run ESLint on TypeScript files
- `npm run lint:fix` - Run ESLint with auto-fix
- `npm run lint:check` - Run ESLint with zero warnings tolerance (CI mode)
- `npm run format` - Format code with Prettier

### Testing

- `npm test` - Run all tests
- `npm run test:watch` - Run tests in watch mode for development
- `npm run test:coverage` - Run tests with coverage report (HTML report at coverage/index.html)

### Verification (Quality Gates)

- `npm run verify` - **REQUIRED BEFORE COMMITS**: Run lint → build → test (must all pass)
- `npm run verify:coverage` - Run lint → build → test with coverage report

## Architecture

### Dual Deployment Model

This codebase supports **two deployment targets** with different entry points:

1. **Micro Server** (src/index.ts) - Local development and standalone server
   - Uses micro for HTTP server
   - Uses microrouter for routing
   - Exports CommonJS module with CORS enabled
   - Routes defined in src/routes.ts

2. **AWS Lambda** (src/lambdas/\*.ts) - Serverless deployment
   - Each endpoint has a corresponding Lambda handler
   - Uses APIGatewayProxyEvent/Result types
   - Shared business logic via src/services.ts

Both deployment models share the same core business logic (services.ts, mappings.ts, helpers.ts, types.ts).

### Data Flow

1. **Routes** (src/routes.ts) - Request handlers for micro server that validate params and call services
2. **Services** (src/services.ts) - Core business logic:
   - getRawDataFromFiles: Reads CSV files for specified seasons
   - getPlayersStatsSeason/getPlayersCombined: Process player stats
   - getGoaliesStatsSeason/getGoaliesCombined: Process goalie stats
3. **Mappings** (src/mappings.ts) - Transform raw CSV data to typed objects:
   - mapPlayerData/mapGoalieData: Single season mapping
   - mapCombinedPlayerData/mapCombinedGoalieData: Aggregate multiple seasons using Map for deduplication by player name
4. **Helpers** (src/helpers.ts) - Utilities for sorting, validation, season discovery, and fantasy scoring

### Key Implementation Details

**CSV File Format**: CSV files are named `{reportType}-{year}-{year+1}.csv` (e.g., regular-2024-2025.csv). The first column determines player type: "G" for goalies, others for players. Field names are generic (field2, field3, etc.) due to inconsistent CSV export headers.

**Season Discovery**: Available seasons are determined by counting regular season CSV files in the csv/ directory at startup (see helpers.ts).

**Scoring**:

- Player and goalie items include a `score` field (0–100, two decimals) computed from their total stats, a `scoreAdjustedByGames` field (0–100, two decimals) computed from per-game stats (with a minimum games threshold), plus a `scores` object with per-stat normalized values.
- Player scoring fields: goals, assists, points, plusMinus, penalties, shots, ppp, shp, hits, blocks.
- Goalie scoring fields: wins, saves, shutouts, plus optional gaa and savePercent when present (goalie goals/assists/points/PIM/PP/SHP are tracked but not used in scoring).
- For non-negative fields (goals, assists, points, penalties, shots, ppp, shp, hits, blocks, wins, saves, shutouts), scoring normalizes from a baseline of 0 up to the maximum value seen in the current result set: 0 maps to 0, the maximum to 100, and values in between are placed linearly between them. For goalies, only wins, saves, and shutouts participate in this part of the score.
- `plusMinus` uses per-dataset min/max, where the minimum can be negative. Advanced goalie stats use more stable scaling: for `savePercent`, a fixed baseline defined by `GOALIE_SAVE_PERCENT_BASELINE` in constants.ts (default .850) maps to 0 points and the best save% in the dataset maps to 100 with linear interpolation between; for `gaa`, the lowest GAA maps to 100 and other goalies are down-weighted linearly based on how much worse they are than the best, using `GOALIE_GAA_MAX_DIFF_RATIO` in constants.ts as the cutoff for reaching 0.
- Per-field scores are averaged (with configurable weights in constants.ts) to produce an initial `score` for each item. Then, within each result set, the best `score` is normalized to exactly 100 and all other positive `score` values are scaled proportionally relative to that best value. The raw normalized 0–100 values per stat are exposed via the `scores` map on each player/goalie.
- `scoreAdjustedByGames` follows the same weighting model but is computed from per-game stats for items meeting `MIN_GAMES_FOR_ADJUSTED_SCORE`. After per-game scores are computed, the best `scoreAdjustedByGames` in the result set is normalized to 100 and other positive values are scaled to be percentages of that best per-game result; under-minimum items always remain at 0.

**Data Quirks**:

- Goalie wins/games column order changed after 2013 season (see mappings.ts:100-106)
- Numbers contain commas in thousands and must be cleaned before parsing
- Players with 0 games are filtered out
- GAA and save percentage are not included in combined goalie stats

**Combined Stats Logic**: When combining seasons, stats are summed by player name using a Map for efficient deduplication. Each combined record includes a `seasons` array with individual season breakdowns.

### Code Quality Patterns

The codebase follows these quality patterns established through systematic refactoring:

**Constants Over Magic Values**:

- `GOALIE_SCHEMA_CHANGE_YEAR = 2013` (constants.ts:5) - Documents the year goalie CSV schema changed
- `CSV` object (constants.ts:21-49) - Self-documenting field mappings replace generic field2, field7, etc.
- `HTTP_STATUS` object (constants.ts:9-13) - Named constants for 200, 400, 500 status codes

**Error Handling**:

- CSV file reading errors are logged with `console.error` including file path (services.ts:33)
- Route handlers use `withErrorHandling` wrapper to consistently handle errors (routes.ts:13-23)
- Early returns after validation errors prevent code execution after error responses (routes.ts)

**Type Safety**:

- No `any` types in production code except necessary test cases
- Proper type assertions instead of `any` in sort functions (helpers.ts:30-36)
- Season parameter parsing with `parseSeasonParam` correctly handles undefined (helpers.ts:51-55)

**DRY Principles**:

- `getCombinedStats` generic helper eliminates duplication between player/goalie combined endpoints (services.ts:62-70)
- `withErrorHandling` wrapper eliminates repeated try/catch blocks in route handlers (routes.ts:13-23)

### TypeScript Configuration

- Target: ES2017, CommonJS modules
- Output: lib/ directory
- Strict mode enabled with noUnusedLocals and noUnusedParameters
- **Test files excluded from build**: tsconfig.json excludes `src/**/*.test.ts` and `src/__tests__/` from compilation
  - Test files are only compiled by ts-jest when running tests
  - Build output in lib/ contains only production code (routes, services, mappings, helpers, types, index)

### ESLint Rules

- Unused vars/args starting with `_` are ignored
- `@typescript-eslint/no-explicit-any` is set to warn (not error)
- Enforces prefer-const, no-var, object-shorthand, prefer-template

## Quality Gates (CRITICAL)

**All code changes MUST pass these checks before committing:**

1. **Lint Check**: `npm run lint:check` - Zero warnings or errors allowed
2. **Build**: `npm run build` - TypeScript compilation must succeed
3. **Tests**: `npm test` - All tests must pass with 100%/100%/100%/≥90% coverage (statements/functions/lines/branches)

**Use `npm run verify` to run all three checks in sequence.** This is the gate for all commits.

### Build Requirements

- Test files (`src/__tests__/**`, `src/**/*.test.ts`) are excluded from TypeScript compilation
- Production build creates clean output in `lib/` with only runtime code
- Jest runs with `isolatedModules: true` for faster test compilation
- Express types (`@types/express`) required as devDependency for node-mocks-http compatibility

## Testing

### Test Suite Overview

Comprehensive test suite using Jest with TypeScript support via ts-jest. **100+ tests** covering all business logic and micro server routes.

**Coverage:** 100% statements, 100% functions, 100% lines, 100% branches

- Lambda handlers are excluded from coverage (tested separately if needed)

### Test Structure

```
src/__tests__/
├── fixtures.ts          # Reusable test data and mock objects
├── helpers.test.ts      # Sorting, validation, season discovery, scoring (includes parseSeasonParam)
├── mappings.test.ts     # CSV data transformation (33 tests)
├── services.test.ts     # Business logic, CSV reading (17 tests)
└── routes.test.ts       # HTTP route handlers (21 tests)
```

### Key Testing Patterns

**Mocking Strategy:**

- `fs` module is mocked at module load time in helpers.test.ts
- `csvtojson` is mocked to return controlled test data
- `micro` send function is mocked to verify responses
- `node-mocks-http` is used to create mock request/response objects for route tests

**Critical Test Cases:**

- Goalie wins/games column swap at season 2013 boundary (mappings.ts:100-106)
- CSV number parsing with comma removal ("1,234" → 1234)
- Filter logic that excludes header rows, empty names, zero games, non-goalies
- Combined stats aggregation using Map for player name deduplication
- Error handling for missing CSV files (returns empty arrays)
- All || 0 fallback operators for invalid numeric values

### Jest Configuration

- Coverage thresholds: 90% branches, 100% functions/lines/statements
- Test environment: Node
- Test match pattern: `**/__tests__/**/*.test.ts`
- Coverage excludes: `src/lambdas/**`, `src/types.ts`, `src/index.ts`
- Reports: Terminal summary + HTML at `coverage/index.html`

### Adding New Tests

When modifying code:

1. Filters always require header row in test data (index 0 is skipped)
2. Player filter checks: `i !== 0 && field2 !== "" && Skaters !== "G" && Number(field7) > 0`
3. Goalie filter checks: `i !== 0 && field2 !== "" && Skaters === "G" && (games > 0 OR wins > 0)`
4. Mock fs before importing helpers.ts to avoid module load errors
5. Test both season <=2013 and >2013 paths for goalie mapping
