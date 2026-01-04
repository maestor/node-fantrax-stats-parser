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

## Architecture

### Dual Deployment Model

This codebase supports **two deployment targets** with different entry points:

1. **Micro Server** (src/index.ts) - Local development and standalone server
   - Uses micro for HTTP server
   - Uses microrouter for routing
   - Exports CommonJS module with CORS enabled
   - Routes defined in src/routes.ts

2. **AWS Lambda** (src/lambdas/*.ts) - Serverless deployment
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
4. **Helpers** (src/helpers.ts) - Utilities for sorting, validation, and season discovery

### Key Implementation Details

**CSV File Format**: CSV files are named `{reportType}-{year}-{year+1}.csv` (e.g., regular-2024-2025.csv). The first column determines player type: "G" for goalies, others for players. Field names are generic (field2, field3, etc.) due to inconsistent CSV export headers.

**Season Discovery**: Available seasons are determined by counting regular season CSV files in the csv/ directory at startup (see helpers.ts:13).

**Data Quirks**:
- Goalie wins/games column order changed after 2013 season (see mappings.ts:100-106)
- Numbers contain commas in thousands and must be cleaned before parsing
- Players with 0 games are filtered out
- GAA and save percentage are not included in combined goalie stats

**Combined Stats Logic**: When combining seasons, stats are summed by player name using a Map for efficient deduplication. Each combined record includes a `seasons` array with individual season breakdowns.

### TypeScript Configuration

- Target: ES2017, CommonJS modules
- Output: lib/ directory
- Strict mode enabled with noUnusedLocals and noUnusedParameters

### ESLint Rules

- Unused vars/args starting with `_` are ignored
- `@typescript-eslint/no-explicit-any` is set to warn (not error)
- Enforces prefer-const, no-var, object-shorthand, prefer-template

## Testing

### Test Suite Overview

Comprehensive test suite using Jest with TypeScript support via ts-jest. **87 tests** covering all business logic and micro server routes.

**Coverage:** 100% statements, 100% functions, 100% lines, 97% branches
- Lambda handlers are excluded from coverage (tested separately if needed)
- The 2 uncovered branches are defensive programming that can't be reached (helpers.ts:43, mappings.ts:24)

### Test Structure

```
src/__tests__/
├── fixtures.ts          # Reusable test data and mock objects
├── helpers.test.ts      # Sorting, validation, season discovery (16 tests)
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

- Coverage thresholds: 97% branches, 100% functions/lines/statements
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
