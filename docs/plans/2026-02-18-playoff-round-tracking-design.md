# Design: Playoff Round Tracking + Leaderboard API

**Date:** 2026-02-18
**Status:** Approved

---

## Overview

Track which round each team reached in the playoffs each season, store it in the database, and expose an all-time leaderboard API endpoint. Implemented in two sequential phases.

---

## Phase 1: Playoff Round Tracking

### 1.1 fantrax-playoffs.json — Schema v3

Bump `schemaVersion` from `2` → `3`. Each team in `PlayoffsTeamRun` gains two new fields:

```typescript
type PlayoffsTeamRun = Team & {
  startDate: string;
  endDate: string;
  rosterTeamId: string;
  roundReached: number;   // 1–4: the last round the team participated in
  isChampion: boolean;    // true for exactly one team per season
};
```

`roundReached` is derived from `teamsByPeriod` — the last period index where a team appears.
`isChampion` is determined by champion scraping (see below).

### 1.2 `sync-playoffs.ts` — Champion scraping

Add a new helper `scrapeChampionFromBracket(page: Page): Promise<string | null>` in `helpers.ts`:

- Locates `.league-playoff-tree__cell--champion .league-playoff-tree__cell__team`
- Returns the team's display name, or `null` if the element is not found
- If `null`: `isChampion` stays `false` for all teams that season (manual fix required)

This runs on the same standings page already visited — no additional navigation needed.

### 1.3 `computePlayoffTeamRunsFromPlayoffsPeriods` — roundReached derivation

Extend the return type to include `roundReached` per team:

- A team that appears in `teamsByPeriod[0]` only → `roundReached = 1`
- A team that advances through `teamsByPeriod[1]` → `roundReached = 2`
- And so on up to `roundReached = 4` (finalists)

The champion is passed in as a separate argument (display name string or null), matched via `normalizeSpacesLower` against team names to set `isChampion: true`.

### 1.4 `compute-manual-data.ts` — 2018 season

The 2018 manual team runs gain `roundReached` values per team.
**Colorado Avalanche** (`id: "1"`) gets `isChampion: true`.

### 1.5 `--import-db` flag

When `sync-playoffs.ts` is run with `--import-db`:

1. After writing `fantrax-playoffs.json`, read it back
2. For each season's teams, resolve `team_id` from `TEAMS` by matching `presentName` or `nameAliases` (case-insensitive, normalised spaces)
3. Compute `round` for DB: `isChampion ? 5 : roundReached`
4. `INSERT OR REPLACE` into `playoff_results` for all teams in all processed seasons

### 1.6 Database migration

New table added to `scripts/db-migrate.ts`:

```sql
CREATE TABLE IF NOT EXISTS playoff_results (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id TEXT    NOT NULL,
  season  INTEGER NOT NULL,
  round   INTEGER NOT NULL,  -- 1–4 eliminated in that round, 5 = champion
  UNIQUE(team_id, season)
);

CREATE INDEX IF NOT EXISTS idx_playoff_results_season
  ON playoff_results(season);
```

### 1.7 Round encoding

| `round` value | Meaning            |
|---------------|--------------------|
| 1             | 1st Round          |
| 2             | 2nd Round          |
| 3             | Conference Final   |
| 4             | Final (runner-up)  |
| 5             | Champion           |

Labels are derived in the client/UI — not stored in the database.

### 1.8 npm script update

`playwright:sync:playoffs` docs updated to document the `--import-db` flag.

---

## Phase 2: Leaderboard API

### 2.1 Endpoint

```
GET /leaderboard/playoffs
```

- Protected (API key required)
- No query params — returns all-time aggregation across all seasons
- No `teamId` param — `playoff_results` stores the authoritative team IDs from `TEAMS`

### 2.2 SQL Query (`src/db/queries.ts`)

```sql
SELECT
  team_id,
  SUM(CASE WHEN round = 5 THEN 1 ELSE 0 END) AS championships,
  SUM(CASE WHEN round = 4 THEN 1 ELSE 0 END) AS finals,
  SUM(CASE WHEN round = 3 THEN 1 ELSE 0 END) AS conference_finals,
  SUM(CASE WHEN round = 2 THEN 1 ELSE 0 END) AS second_round,
  SUM(CASE WHEN round = 1 THEN 1 ELSE 0 END) AS first_round
FROM playoff_results
GROUP BY team_id
ORDER BY
  championships DESC,
  finals DESC,
  conference_finals DESC,
  second_round DESC,
  first_round DESC
```

### 2.3 Response type

```typescript
type PlayoffLeaderboardEntry = {
  teamId: string;
  teamName: string;        // presentName from TEAMS, resolved in service layer
  championships: number;
  finals: number;
  conferenceFinals: number;
  secondRound: number;
  firstRound: number;
  tieRank: boolean;        // true if this entry's 5-tuple matches the previous entry
};
```

`tieRank` is computed in the service layer after DB results are returned, by comparing each row's `[championships, finals, conferenceFinals, secondRound, firstRound]` tuple against the previous row.

### 2.4 Layer additions

| Layer | Addition |
|-------|----------|
| `src/db/queries.ts` | `getPlayoffLeaderboard()` — executes the SQL above, returns typed rows |
| `src/services.ts` | `getPlayoffLeaderboardData()` — resolves `teamName` from `TEAMS`, computes `tieRank` |
| `src/routes.ts` | `getPlayoffsLeaderboard` handler — delegates to service via `withErrorHandlingCached` |
| `src/index.ts` | Register `get("/leaderboard/playoffs", protectedRoute(getPlayoffsLeaderboard))` |

### 2.5 Example response

```json
[
  { "teamId": "1",  "teamName": "Colorado Avalanche",  "championships": 3, "finals": 2, "conferenceFinals": 2, "secondRound": 4, "firstRound": 2, "tieRank": false },
  { "teamId": "4",  "teamName": "Vancouver Canucks",   "championships": 3, "finals": 0, "conferenceFinals": 4, "secondRound": 2, "firstRound": 4, "tieRank": false },
  { "teamId": "5",  "teamName": "Montreal Canadiens",  "championships": 2, "finals": 5, "conferenceFinals": 4, "secondRound": 0, "firstRound": 1, "tieRank": false },
  { "teamId": "10", "teamName": "Nashville Predators", "championships": 2, "finals": 1, "conferenceFinals": 1, "secondRound": 5, "firstRound": 4, "tieRank": false },
  { "teamId": "6",  "teamName": "Detroit Red Wings",   "championships": 1, "finals": 0, "conferenceFinals": 0, "secondRound": 0, "firstRound": 3, "tieRank": false },
  { "teamId": "15", "teamName": "St. Louis Blues",     "championships": 1, "finals": 0, "conferenceFinals": 0, "secondRound": 0, "firstRound": 3, "tieRank": true  }
]
```

---

## Testing Plan

### Phase 1 tests

| File | What to test |
|------|-------------|
| `helpers.test.ts` | `scrapeChampionFromBracket` — mock page locator: found case, not-found case |
| `helpers.test.ts` | Extended `computePlayoffTeamRunsFromPlayoffsPeriods` — `roundReached` derivation, `isChampion` assignment, null champion case |
| New `sync-playoffs` unit tests (if extractable) | `--import-db` path: DB upsert called with correct round values |

### Phase 2 tests

| File | What to test |
|------|-------------|
| `queries.test.ts` | `getPlayoffLeaderboard()` — mock DB client, verify SQL mapping |
| `services.test.ts` | `getPlayoffLeaderboardData()` — `tieRank` computation (tied pair, non-tied, first entry always false), `teamName` resolution |
| `routes.test.ts` | `GET /leaderboard/playoffs` — 200 with data, empty result, error handling |

Coverage must remain at 100% across all metrics (`npm run verify`).

---

## Docs to update after implementation

- **`README.md`**: Add `/leaderboard/playoffs` to the Endpoints section; update `playwright:sync:playoffs` section to document `--import-db` flag
- **`docs/DEVELOPMENT.md`**: Update npm scripts reference if new scripts are added
