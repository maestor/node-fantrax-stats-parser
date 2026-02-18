# Playoff Round Tracking + Leaderboard API — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Track which playoff round each team reached each season, store it in the database, and expose a `GET /leaderboard/playoffs` endpoint.

**Architecture:** Two phases. Phase 1 extends the Playwright scraping pipeline (`sync-playoffs.ts`) to capture `roundReached` (1–4) and `isChampion` per team, writes them to the JSON and optionally the DB. Phase 2 adds a DB query + service + route for the all-time leaderboard. All playwright source is excluded from Jest coverage (`src/playwright/**`); only Phase 2 API code requires tests.

**Tech Stack:** TypeScript, tsx (playwright scripts), Turso/libSQL (`getDbClient`), Jest + node-mocks-http, micro/microrouter.

---

## Phase 1 — Playoff Round Tracking

### Task 1: Add `playoff_results` table to DB migration

**Files:**
- Modify: `scripts/db-migrate.ts`

**Step 1: Add the two new SQL statements to `SCHEMA_SQL`**

In `scripts/db-migrate.ts`, add after the last existing index string (line ~55):

```typescript
  `CREATE TABLE IF NOT EXISTS playoff_results (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id TEXT    NOT NULL,
    season  INTEGER NOT NULL,
    round   INTEGER NOT NULL,
    UNIQUE(team_id, season)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_playoff_results_season
    ON playoff_results(season)`,
```

`round` encoding: 1 = 1st Round, 2 = 2nd Round, 3 = Conference Final, 4 = Final, 5 = Champion.

**Step 2: Update the console log output**

Change the `Tables:` log line:
```typescript
  console.log("   Tables: players, goalies, import_metadata, playoff_results");
```

**Step 3: Run migration against local DB**

```bash
npm run db:migrate
```

Expected output:
```
🗄️  Running database migration...
✅ Migration complete!
   Tables: players, goalies, import_metadata, playoff_results
```

**Step 4: Commit**

```bash
git add scripts/db-migrate.ts
git commit -m "feat: add playoff_results table to DB migration"
```

---

### Task 2: Add `TeamRunWithRound` type and extend `computePlayoffTeamRunsFromPlayoffsPeriods`

**Files:**
- Modify: `src/playwright/helpers.ts`

This function already computes `lastIdx` (0-based index of the last period a team appears in). We extend the return type to include `roundReached` and `isChampion`, and accept a `champion` parameter.

**Step 1: Export a new type `TeamRunWithRound` near the existing `TeamRun` type**

Find the `TeamRun` export in `src/playwright/helpers.ts` and add below it:

```typescript
export type TeamRunWithRound = TeamRun & {
  roundReached: number;
  isChampion: boolean;
};
```

**Step 2: Update `computePlayoffTeamRunsFromPlayoffsPeriods` signature**

Change:
```typescript
export const computePlayoffTeamRunsFromPlayoffsPeriods = (args: {
  periods: RoundWindow[];
  teamsByPeriod: string[][];
  expectedRoundTeamCounts: number[];
  allTeams: readonly Team[];
}): TeamRun[] | null => {
```

To:
```typescript
export const computePlayoffTeamRunsFromPlayoffsPeriods = (args: {
  periods: RoundWindow[];
  teamsByPeriod: string[][];
  expectedRoundTeamCounts: number[];
  allTeams: readonly Team[];
  champion: string | null;
}): TeamRunWithRound[] | null => {
```

**Step 3: Update the `runs.push(...)` call inside the function**

Find the existing push (currently around line 374):
```typescript
    runs.push({ ...team, startDate, endDate: periods[lastIdx].endDate });
```

Replace with:
```typescript
    const roundReached = lastIdx + 1;
    const isChampion =
      args.champion !== null &&
      normalizeSpacesLower(team.presentName) === normalizeSpacesLower(args.champion);
    runs.push({
      ...team,
      startDate,
      endDate: periods[lastIdx].endDate,
      roundReached,
      isChampion,
    });
```

**Step 4: Update return type annotation of `runs`**

Change:
```typescript
  const runs: TeamRun[] = [];
```
To:
```typescript
  const runs: TeamRunWithRound[] = [];
```

**Step 5: Verify TypeScript compiles**

```bash
npm run typecheck
```

Expected: no errors.

**Step 6: Commit**

```bash
git add src/playwright/helpers.ts
git commit -m "feat: extend computePlayoffTeamRunsFromPlayoffsPeriods with roundReached and isChampion"
```

---

### Task 3: Add `scrapeChampionFromBracket` helper

**Files:**
- Modify: `src/playwright/helpers.ts`

**Step 1: Add the function export after `scrapePlayoffsPeriodsFromStandingsTables`**

```typescript
export const scrapeChampionFromBracket = async (
  page: Page,
): Promise<string | null> => {
  const cell = page.locator(
    ".league-playoff-tree__cell--champion .league-playoff-tree__cell__team",
  );
  const count = await cell.count();
  if (count === 0) return null;
  const text = normalizeSpaces(await cell.first().innerText().catch(() => ""));
  return text || null;
};
```

**Step 2: Verify TypeScript compiles**

```bash
npm run typecheck
```

**Step 3: Commit**

```bash
git add src/playwright/helpers.ts
git commit -m "feat: add scrapeChampionFromBracket helper"
```

---

### Task 4: Update `compute-manual-data.ts` with `roundReached` and `isChampion`

**Files:**
- Modify: `src/playwright/compute-manual-data.ts`

The 2018 manual data already groups teams by their `endDate` — these date groups correspond to rounds. Colorado Avalanche is the 2018 champion.

**Step 1: Update the import and return type**

Change:
```typescript
import type { TeamRun } from "./helpers";

export const computeManual2018PlayoffsTeamRuns = (
  teams: readonly Team[],
): TeamRun[] => {
```

To:
```typescript
import type { TeamRunWithRound } from "./helpers";

export const computeManual2018PlayoffsTeamRuns = (
  teams: readonly Team[],
): TeamRunWithRound[] => {
```

**Step 2: Replace `endByPresentName` with a `roundByPresentName` structure**

Replace the entire `endByPresentName` record and the `runs` loop with:

```typescript
  const CHAMPION = "Colorado Avalanche";

  // endDate encodes the round each team was eliminated in (or won).
  // round 1: eliminated first, round 4: finalist, champion: still round 4 endDate.
  const roundDataByPresentName: Record<
    string,
    { endDate: string; roundReached: number }
  > = {
    // Round 1 exits
    "Winnipeg Jets":       { endDate: "2019-03-10", roundReached: 1 },
    "Calgary Flames":      { endDate: "2019-03-10", roundReached: 1 },
    "Vancouver Canucks":   { endDate: "2019-03-10", roundReached: 1 },
    "Florida Panthers":    { endDate: "2019-03-10", roundReached: 1 },
    "New Jersey Devils":   { endDate: "2019-03-10", roundReached: 1 },
    "New York Islanders":  { endDate: "2019-03-10", roundReached: 1 },
    "St. Louis Blues":     { endDate: "2019-03-10", roundReached: 1 },
    "Tampa Bay Lightning": { endDate: "2019-03-10", roundReached: 1 },
    // Round 2 exits
    "Nashville Predators": { endDate: "2019-03-17", roundReached: 2 },
    "Boston Bruins":       { endDate: "2019-03-17", roundReached: 2 },
    "Dallas Stars":        { endDate: "2019-03-17", roundReached: 2 },
    "Philadelphia Flyers": { endDate: "2019-03-17", roundReached: 2 },
    // Round 3 exits (Conference Final)
    "Anaheim Ducks":       { endDate: "2019-03-24", roundReached: 3 },
    "Montreal Canadiens":  { endDate: "2019-03-24", roundReached: 3 },
    // Finalists (round 4)
    "New York Rangers":    { endDate: "2019-04-06", roundReached: 4 },
    "Colorado Avalanche":  { endDate: "2019-04-06", roundReached: 4 },
  };

  const runs: TeamRunWithRound[] = [];
  for (const [presentName, { endDate, roundReached }] of Object.entries(
    roundDataByPresentName,
  )) {
    const team = teams.find((t) => t.presentName === presentName);
    if (!team) {
      throw new Error(
        `Manual 2018 mapping references unknown team presentName: ${presentName}`,
      );
    }
    runs.push({
      ...team,
      startDate,
      endDate,
      roundReached,
      isChampion: presentName === CHAMPION,
    });
  }
```

**Step 3: Verify TypeScript compiles**

```bash
npm run typecheck
```

**Step 4: Commit**

```bash
git add src/playwright/compute-manual-data.ts
git commit -m "feat: add roundReached and isChampion to 2018 manual playoff data"
```

---

### Task 5: Update `sync-playoffs.ts` — schema v3, champion scraping, `--import-db`

**Files:**
- Modify: `src/playwright/sync-playoffs.ts`

This is the biggest change. Work through it in sub-steps.

**Step 1: Update imports**

Add to the existing import from `"./helpers"`:
```typescript
  scrapeChampionFromBracket,
  TeamRunWithRound,
```

Add dotenv import at top of file (needed for `--import-db` DB connection):
```typescript
import dotenv from "dotenv";
dotenv.config();
```

Add DB client import:
```typescript
import { getDbClient } from "../db/client";
```

**Step 2: Update `PlayoffsTeamRun` type**

Change:
```typescript
type PlayoffsTeamRun = Team & {
  startDate: string;
  endDate: string;
  rosterTeamId: string;
};
```

To:
```typescript
type PlayoffsTeamRun = Team & {
  startDate: string;
  endDate: string;
  rosterTeamId: string;
  roundReached: number;
  isChampion: boolean;
};
```

**Step 3: Update `PlayoffsFile` schemaVersion**

Change:
```typescript
type PlayoffsFile = {
  schemaVersion: 2;
```
To:
```typescript
type PlayoffsFile = {
  schemaVersion: 3;
```

**Step 4: Update `readExistingPlayoffsFile` to accept v2 or v3**

Change:
```typescript
    if (file.schemaVersion !== 2 || !Array.isArray(file.seasons)) return null;
```
To:
```typescript
    if (
      (file.schemaVersion !== 2 && file.schemaVersion !== 3) ||
      !Array.isArray(file.seasons)
    ) return null;
```

(We keep accepting v2 so existing files aren't dropped on the next run.)

**Step 5: Fix `ensureRosterTeamIds` to preserve `roundReached` and `isChampion`**

Currently the mapping inside `ensureRosterTeamIds` does `...(t as Team)` which drops the extra fields. Change the return in the `.map()`:

Find:
```typescript
    return {
      ...(t as Team),
      startDate: t.startDate,
      endDate: t.endDate,
      rosterTeamId,
    };
```

Replace with:
```typescript
    return {
      ...t,
      rosterTeamId,
    } as PlayoffsTeamRun;
```

This preserves all fields (including `roundReached`, `isChampion`) and simply overrides `rosterTeamId` with the resolved value.

**Step 6: Update the main season-syncing loop**

In the primary path (after `await gotoPlayoffsStandings`), add champion scraping and pass it to `computePlayoffTeamRunsFromPlayoffsPeriods`:

After:
```typescript
        const { periods, teamsByPeriod, rosterTeamIdByTeamName } =
          await scrapePlayoffsPeriodsFromStandingsTables(page);
```

Add:
```typescript
        const championName = await scrapeChampionFromBracket(page);
        if (!championName) {
          console.info(
            `No champion found in bracket for ${season.year} — isChampion will be false for all teams.`,
          );
        }
```

Then update the `computePlayoffTeamRunsFromPlayoffsPeriods` call:
```typescript
        let baseTeams = computePlayoffTeamRunsFromPlayoffsPeriods({
          periods,
          teamsByPeriod,
          expectedRoundTeamCounts,
          allTeams: TEAMS,
          champion: championName,
        }) as Array<Omit<PlayoffsTeamRun, "rosterTeamId">> | null;
```

**Step 7: Handle the bracket-text fallback path**

For the fallback (`computePlayoffTeamRunsFromBracketText`), we enrich `roundReached` from round end dates after the call. After the `baseTeams` fallback assignment, add:

```typescript
          if (baseTeams) {
            // Enrich roundReached from round boundary endDates
            const roundEndDates = rounds.map((r) => r.endDate);
            baseTeams = baseTeams.map((t) => {
              const roundIdx = roundEndDates.findIndex(
                (d) => d >= t.endDate,
              );
              return {
                ...t,
                roundReached: roundIdx >= 0 ? roundIdx + 1 : rounds.length,
                isChampion:
                  championName !== null &&
                  normalizeSpacesLower(t.presentName) ===
                    normalizeSpacesLower(championName),
              };
            }) as Array<Omit<PlayoffsTeamRun, "rosterTeamId">>;
          }
```

Note: `scrapeChampionFromBracket` was already called above in the primary path attempt — if we reached the fallback, the page is the same, so champion scraping result is still valid.

**Step 8: Update `seasonByYear.set(...)` to use schemaVersion 3**

Find:
```typescript
    const file: PlayoffsFile = {
      schemaVersion: 2,
```
Change to:
```typescript
    const file: PlayoffsFile = {
      schemaVersion: 3,
```

**Step 9: Parse `--import-db` flag and add DB upsert logic**

After existing flag parsing (near `const debug = hasFlag(argv, "--debug")`), add:
```typescript
  const importDb = hasFlag(argv, "--import-db");
```

After `writeFileSync(PLAYOFFS_PATH, ...)`, add:

```typescript
  if (importDb) {
    await upsertPlayoffResultsToDb([...seasonByYear.values()]);
  }
```

Add the `upsertPlayoffResultsToDb` function before `main`:

```typescript
const upsertPlayoffResultsToDb = async (
  seasons: PlayoffsSeason[],
): Promise<void> => {
  const db = getDbClient();
  let upserted = 0;
  for (const season of seasons) {
    for (const team of season.teams) {
      if (!team.roundReached) continue; // skip teams without round data (v2 holdover)
      const round = team.isChampion ? 5 : team.roundReached;
      await db.execute({
        sql: `INSERT OR REPLACE INTO playoff_results (team_id, season, round)
              VALUES (?, ?, ?)`,
        args: [team.id, season.year, round],
      });
      upserted++;
    }
  }
  console.info(`Upserted ${upserted} playoff result(s) into database.`);
};
```

**Step 10: Verify TypeScript compiles**

```bash
npm run typecheck
```

**Step 11: Commit**

```bash
git add src/playwright/sync-playoffs.ts
git commit -m "feat: sync-playoffs captures roundReached, isChampion, adds --import-db flag"
```

---

### Task 6: Update `import-league-playoffs.ts` to accept schemaVersion 3

**Files:**
- Modify: `src/playwright/import-league-playoffs.ts`

The file currently rejects anything that isn't schemaVersion 2. Since `sync-playoffs.ts` now writes v3, update the check.

**Step 1: Update the `PlayoffsFileV2` type and schema check**

In `readPlayoffsFileV2`, change:
```typescript
  if (file.schemaVersion !== 2 || !Array.isArray(file.seasons)) {
    throw new Error(
      `Unsupported playoffs mapping schema in ${PLAYOFFS_PATH}. Expected schemaVersion 2. ` +
```

To:
```typescript
  if (
    (file.schemaVersion !== 2 && file.schemaVersion !== 3) ||
    !Array.isArray(file.seasons)
  ) {
    throw new Error(
      `Unsupported playoffs mapping schema in ${PLAYOFFS_PATH}. Expected schemaVersion 2 or 3. ` +
```

**Step 2: Verify TypeScript compiles**

```bash
npm run typecheck
```

**Step 3: Commit**

```bash
git add src/playwright/import-league-playoffs.ts
git commit -m "feat: import-league-playoffs accepts schemaVersion 2 or 3"
```

---

### Task 7: Verify Phase 1 with a full quality gate

```bash
npm run verify
```

Expected: all pass (no new coverage obligations since `src/playwright/**` is excluded).

---

## Phase 2 — Leaderboard API

### Task 8: Add `PlayoffLeaderboardEntry` type

**Files:**
- Modify: `src/types.ts`

**Step 1: Add the type at the end of `src/types.ts`**

```typescript
export type PlayoffLeaderboardEntry = {
  teamId: string;
  teamName: string;
  championships: number;
  finals: number;
  conferenceFinals: number;
  secondRound: number;
  firstRound: number;
  tieRank: boolean;
};
```

**Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: add PlayoffLeaderboardEntry type"
```

---

### Task 9: Add `getPlayoffLeaderboard` DB query (TDD)

**Files:**
- Modify: `src/db/queries.ts`
- Modify: `src/__tests__/queries.test.ts`

**Step 1: Write the failing test**

Add a new `describe("getPlayoffLeaderboard", ...)` block in `src/__tests__/queries.test.ts`. Import `getPlayoffLeaderboard` (will fail until implemented):

```typescript
import {
  getPlayersFromDb,
  getGoaliesFromDb,
  getAvailableSeasonsFromDb,
  getTeamIdsWithData,
  getLastModifiedFromDb,
  getPlayoffLeaderboard,
} from "../db/queries";
```

Then at the bottom of the file:

```typescript
  describe("getPlayoffLeaderboard", () => {
    test("returns mapped leaderboard rows sorted by SQL order", async () => {
      mockExecute.mockResolvedValue({
        rows: [
          {
            team_id: "1",
            championships: 3,
            finals: 2,
            conference_finals: 2,
            second_round: 4,
            first_round: 2,
          },
          {
            team_id: "4",
            championships: 3,
            finals: 0,
            conference_finals: 4,
            second_round: 2,
            first_round: 4,
          },
        ],
      });

      const result = await getPlayoffLeaderboard();

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("playoff_results"),
      );
      expect(result).toEqual([
        {
          teamId: "1",
          championships: 3,
          finals: 2,
          conferenceFinals: 2,
          secondRound: 4,
          firstRound: 2,
        },
        {
          teamId: "4",
          championships: 3,
          finals: 0,
          conferenceFinals: 4,
          secondRound: 2,
          firstRound: 4,
        },
      ]);
    });

    test("returns empty array when no playoff results exist", async () => {
      mockExecute.mockResolvedValue({ rows: [] });
      const result = await getPlayoffLeaderboard();
      expect(result).toEqual([]);
    });
  });
```

**Step 2: Run the test to confirm it fails**

```bash
npx jest src/__tests__/queries.test.ts --testNamePattern="getPlayoffLeaderboard" --no-coverage
```

Expected: FAIL — `getPlayoffLeaderboard is not a function`.

**Step 3: Implement `getPlayoffLeaderboard` in `src/db/queries.ts`**

Add at the bottom of `src/db/queries.ts`:

```typescript
interface PlayoffLeaderboardRow {
  team_id: string;
  championships: number;
  finals: number;
  conference_finals: number;
  second_round: number;
  first_round: number;
}

type PlayoffLeaderboardDbEntry = Omit<
  import("../types").PlayoffLeaderboardEntry,
  "teamName" | "tieRank"
>;

const mapLeaderboardRow = (row: PlayoffLeaderboardRow): PlayoffLeaderboardDbEntry => ({
  teamId: row.team_id,
  championships: row.championships,
  finals: row.finals,
  conferenceFinals: row.conference_finals,
  secondRound: row.second_round,
  firstRound: row.first_round,
});

export const getPlayoffLeaderboard = async (): Promise<
  PlayoffLeaderboardDbEntry[]
> => {
  const db = getDbClient();
  const result = await db.execute(
    `SELECT
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
       first_round DESC`,
  );
  return (result.rows as unknown as PlayoffLeaderboardRow[]).map(
    mapLeaderboardRow,
  );
};
```

**Step 4: Run the test to confirm it passes**

```bash
npx jest src/__tests__/queries.test.ts --testNamePattern="getPlayoffLeaderboard" --no-coverage
```

Expected: PASS.

**Step 5: Run full test suite to confirm nothing broke**

```bash
npm run verify
```

Expected: all pass.

**Step 6: Commit**

```bash
git add src/db/queries.ts src/__tests__/queries.test.ts
git commit -m "feat: add getPlayoffLeaderboard DB query"
```

---

### Task 10: Add `getPlayoffLeaderboardData` service (TDD)

**Files:**
- Modify: `src/services.ts`
- Modify: `src/__tests__/services.test.ts`

The service resolves `teamName` from `TEAMS` by `teamId` and computes `tieRank` (true if the 5-tuple matches the previous entry).

**Step 1: Write the failing tests**

Add to `src/__tests__/services.test.ts`:

```typescript
import {
  getAvailableSeasons,
  getPlayersStatsSeason,
  getGoaliesStatsSeason,
  getPlayersStatsCombined,
  getGoaliesStatsCombined,
  getPlayoffLeaderboardData,
} from "../services";
```

Add to the mock:
```typescript
jest.mock("../db/queries", () => ({
  ...jest.requireActual("../db/queries"),  // keep other mocks working
}));
```

Wait — looking at the existing test file, `../db/queries` is already mocked via individual imports. Add `getPlayoffLeaderboard` to the mock:

```typescript
import { getPlayersFromDb, getGoaliesFromDb, getPlayoffLeaderboard } from "../db/queries";
```

In `jest.mock("../db/queries")` section at the top, the mock is implicit (Jest auto-mocks). Since we're adding `getPlayoffLeaderboard` we need to include it in the mock setup.

At the bottom of `src/__tests__/services.test.ts`, add:

```typescript
  describe("getPlayoffLeaderboardData", () => {
    const mockGetPlayoffLeaderboard = getPlayoffLeaderboard as jest.MockedFunction<
      typeof getPlayoffLeaderboard
    >;

    test("resolves teamName from TEAMS and sets tieRank false for non-tied entries", async () => {
      mockGetPlayoffLeaderboard.mockResolvedValue([
        { teamId: "1", championships: 3, finals: 2, conferenceFinals: 2, secondRound: 4, firstRound: 2 },
        { teamId: "4", championships: 3, finals: 0, conferenceFinals: 4, secondRound: 2, firstRound: 4 },
      ]);

      const result = await getPlayoffLeaderboardData();

      expect(result[0]).toMatchObject({
        teamId: "1",
        teamName: "Colorado Avalanche",
        tieRank: false,
      });
      expect(result[1]).toMatchObject({
        teamId: "4",
        teamName: "Vancouver Canucks",
        tieRank: false,
      });
    });

    test("sets tieRank true when 5-tuple matches previous entry", async () => {
      mockGetPlayoffLeaderboard.mockResolvedValue([
        { teamId: "1", championships: 1, finals: 0, conferenceFinals: 0, secondRound: 0, firstRound: 3 },
        { teamId: "15", championships: 1, finals: 0, conferenceFinals: 0, secondRound: 0, firstRound: 3 },
      ]);

      const result = await getPlayoffLeaderboardData();

      expect(result[0].tieRank).toBe(false);
      expect(result[1].tieRank).toBe(true);
    });

    test("first entry is always tieRank false", async () => {
      mockGetPlayoffLeaderboard.mockResolvedValue([
        { teamId: "1", championships: 5, finals: 0, conferenceFinals: 0, secondRound: 0, firstRound: 0 },
      ]);

      const result = await getPlayoffLeaderboardData();

      expect(result[0].tieRank).toBe(false);
    });

    test("returns empty array when no data", async () => {
      mockGetPlayoffLeaderboard.mockResolvedValue([]);
      const result = await getPlayoffLeaderboardData();
      expect(result).toEqual([]);
    });

    test("uses teamId as teamName when team not found in TEAMS", async () => {
      mockGetPlayoffLeaderboard.mockResolvedValue([
        { teamId: "999", championships: 1, finals: 0, conferenceFinals: 0, secondRound: 0, firstRound: 0 },
      ]);

      const result = await getPlayoffLeaderboardData();
      expect(result[0].teamName).toBe("999");
    });
  });
```

**Step 2: Run the tests to confirm they fail**

```bash
npx jest src/__tests__/services.test.ts --testNamePattern="getPlayoffLeaderboardData" --no-coverage
```

Expected: FAIL — `getPlayoffLeaderboardData is not a function`.

**Step 3: Implement `getPlayoffLeaderboardData` in `src/services.ts`**

Add imports at the top of `src/services.ts`:
```typescript
import { TEAMS } from "./constants";
import { getPlayoffLeaderboard } from "./db/queries";
import type { PlayoffLeaderboardEntry } from "./types";
```

Add at the bottom of `src/services.ts`:

```typescript
export const getPlayoffLeaderboardData = async (): Promise<
  PlayoffLeaderboardEntry[]
> => {
  const rows = await getPlayoffLeaderboard();
  return rows.map((row, i) => {
    const team = TEAMS.find((t) => t.id === row.teamId);
    const teamName = team?.presentName ?? row.teamId;

    const prev = i > 0 ? rows[i - 1] : null;
    const tieRank =
      prev !== null &&
      prev.championships === row.championships &&
      prev.finals === row.finals &&
      prev.conferenceFinals === row.conferenceFinals &&
      prev.secondRound === row.secondRound &&
      prev.firstRound === row.firstRound;

    return { ...row, teamName, tieRank };
  });
};
```

**Step 4: Run the tests to confirm they pass**

```bash
npx jest src/__tests__/services.test.ts --testNamePattern="getPlayoffLeaderboardData" --no-coverage
```

Expected: PASS.

**Step 5: Run full suite**

```bash
npm run verify
```

Expected: all pass.

**Step 6: Commit**

```bash
git add src/services.ts src/__tests__/services.test.ts
git commit -m "feat: add getPlayoffLeaderboardData service with tieRank computation"
```

---

### Task 11: Add `getPlayoffsLeaderboard` route handler (TDD)

**Files:**
- Modify: `src/routes.ts`
- Modify: `src/__tests__/routes.test.ts`
- Modify: `src/index.ts`

**Step 1: Write the failing route tests**

Add to the imports in `src/__tests__/routes.test.ts`:

```typescript
import {
  getSeasons,
  getTeams,
  getHealthcheck,
  getPlayersSeason,
  getPlayersCombined,
  getGoaliesSeason,
  getGoaliesCombined,
  getLastModified,
  getPlayoffsLeaderboard,
  resetRouteCachesForTests,
} from "../routes";
```

And add `getPlayoffLeaderboardData` to the services mock:
```typescript
import {
  getAvailableSeasons,
  getPlayersStatsSeason,
  getPlayersStatsCombined,
  getGoaliesStatsSeason,
  getGoaliesStatsCombined,
  getPlayoffLeaderboardData,
} from "../services";
```

Add at the bottom of the `describe("routes", ...)` block:

```typescript
  describe("getPlayoffsLeaderboard", () => {
    test("returns 200 with leaderboard data", async () => {
      const mockData = [
        {
          teamId: "1",
          teamName: "Colorado Avalanche",
          championships: 3,
          finals: 2,
          conferenceFinals: 2,
          secondRound: 4,
          firstRound: 2,
          tieRank: false,
        },
      ];
      (getPlayoffLeaderboardData as jest.Mock).mockResolvedValue(mockData);

      const req = createRequest({ method: "GET", url: "/leaderboard/playoffs" });
      const res = createResponse();

      await getPlayoffsLeaderboard(asRouteReq(req), res);

      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, mockData);
    });

    test("returns 200 with empty array when no data", async () => {
      (getPlayoffLeaderboardData as jest.Mock).mockResolvedValue([]);

      const req = createRequest({ method: "GET", url: "/leaderboard/playoffs" });
      const res = createResponse();

      await getPlayoffsLeaderboard(asRouteReq(req), res);

      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, []);
    });

    test("handles service error", async () => {
      (getPlayoffLeaderboardData as jest.Mock).mockRejectedValue(
        new Error("DB error"),
      );

      const req = createRequest({ method: "GET", url: "/leaderboard/playoffs" });
      const res = createResponse();

      await getPlayoffsLeaderboard(asRouteReq(req), res);

      expect(send).toHaveBeenCalledWith(
        res,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Error),
      );
    });
  });
```

**Step 2: Run tests to confirm they fail**

```bash
npx jest src/__tests__/routes.test.ts --testNamePattern="getPlayoffsLeaderboard" --no-coverage
```

Expected: FAIL — `getPlayoffsLeaderboard is not a function`.

**Step 3: Implement the route handler in `src/routes.ts`**

Add `getPlayoffLeaderboardData` to the import from `"./services"`:
```typescript
import {
  getAvailableSeasons,
  getPlayersStatsSeason,
  getPlayersStatsCombined,
  getGoaliesStatsSeason,
  getGoaliesStatsCombined,
  getPlayoffLeaderboardData,
} from "./services";
```

Add at the bottom of `src/routes.ts`:

```typescript
export const getPlayoffsLeaderboard: AugmentedRequestHandler = async (
  req,
  res,
) => {
  await withErrorHandlingCached(req, res, () => getPlayoffLeaderboardData());
};
```

**Step 4: Register route in `src/index.ts`**

Add `getPlayoffsLeaderboard` to the import from `"./routes"`:
```typescript
import {
  getSeasons,
  getTeams,
  getHealthcheck,
  getPlayersCombined,
  getPlayersSeason,
  getGoaliesCombined,
  getGoaliesSeason,
  getLastModified,
  getPlayoffsLeaderboard,
} from "./routes";
```

Add the route inside `router(...)`, before the `get("/*", notFound)` catch-all:
```typescript
    get("/leaderboard/playoffs", protectedRoute(getPlayoffsLeaderboard)),
```

**Step 5: Run the tests to confirm they pass**

```bash
npx jest src/__tests__/routes.test.ts --testNamePattern="getPlayoffsLeaderboard" --no-coverage
```

Expected: PASS.

**Step 6: Run full suite**

```bash
npm run verify
```

Expected: all pass, 100% coverage.

**Step 7: Commit**

```bash
git add src/routes.ts src/index.ts src/__tests__/routes.test.ts
git commit -m "feat: add GET /leaderboard/playoffs endpoint"
```

---

### Task 12: Update documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/DEVELOPMENT.md` (if needed)

**Step 1: Add endpoint to README.md**

In the **Endpoints** section of `README.md`, after the `/goalies/combined` entry, add:

```markdown
`/leaderboard/playoffs` - All-time playoff leaderboard. Returns each team's count of championships, finals, conference finals, 2nd round appearances, and 1st round appearances, sorted by best record. Each entry includes a `tieRank` boolean (true when the entry's record matches the previous entry's record). Item format: `{ teamId, teamName, championships, finals, conferenceFinals, secondRound, firstRound, tieRank }`.
```

**Step 2: Update `playwright:sync:playoffs` section in README.md**

Find the `### 2b) Sync playoffs teams (local mapping)` section. Add `--import-db` to the useful options:

```markdown
- `--import-db` (after syncing, upsert playoff round results into the local database)
```

Also update the description paragraph to mention the new fields:

```markdown
The mapping includes, per season year:

- which `TEAMS` entries made playoffs (must be 16 teams)
- each playoff team's `startDate` and `endDate` for their playoff run
- each playoff team's `roundReached` (1–4) and `isChampion` flag
```

**Step 3: Run verify one final time**

```bash
npm run verify
```

Expected: all pass.

**Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document /leaderboard/playoffs endpoint and --import-db flag"
```

---

## Summary

| Task | Files | Coverage required |
|------|-------|-------------------|
| 1 | `scripts/db-migrate.ts` | No (scripts/) |
| 2 | `src/playwright/helpers.ts` | No (excluded) |
| 3 | `src/playwright/helpers.ts` | No (excluded) |
| 4 | `src/playwright/compute-manual-data.ts` | No (excluded) |
| 5 | `src/playwright/sync-playoffs.ts` | No (excluded) |
| 6 | `src/playwright/import-league-playoffs.ts` | No (excluded) |
| 7 | `src/types.ts` | No (excluded) |
| 8 | `src/db/queries.ts` + test | **Yes** |
| 9 | `src/services.ts` + test | **Yes** |
| 10 | `src/routes.ts` + `src/index.ts` + test | **Yes** |
| 11 | `README.md` | N/A |
