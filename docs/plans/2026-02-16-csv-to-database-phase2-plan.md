# Phase 2: Switch API to Read from Database

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace all CSV/R2/filesystem reads in the API layer with Turso database queries, then remove orphaned CSV-runtime modules.

**Architecture:** A new `src/db/queries.ts` module provides typed query functions that return the same shapes (`PlayerWithSeason[]`, `GoalieWithSeason[]`) the existing scoring/sorting code expects. `helpers.ts`, `services.ts`, and `routes.ts` swap their CSV/R2 calls for these DB queries. Scoring, merging, mapping, sorting, and HTTP caching are completely untouched. Orphaned modules (`storage/index.ts`, `storage/manifest.ts`, `csvIntegrity.ts`) and their tests are removed.

**Tech Stack:** `@libsql/client` (already installed), existing TypeScript types from `types.ts`, existing scoring/sorting from `helpers.ts`.

---

### Task 1: Create `src/db/queries.ts` and `src/__tests__/queries.test.ts`

**Files:**
- Create: `src/db/queries.ts`
- Create: `src/__tests__/queries.test.ts`

**Context:** This module is the new boundary between the database and the rest of the app. Every function returns data in shapes the existing code already consumes. Column mapping (snake_case → camelCase) and type conversions (REAL → string for `gaa`/`savePercent`) happen here and nowhere else.

**Step 1: Write the failing tests**

Create `src/__tests__/queries.test.ts`:

```typescript
jest.mock("../db/client", () => {
  const mockExecute = jest.fn();
  return {
    getDbClient: jest.fn(() => ({ execute: mockExecute })),
  };
});

import { getDbClient } from "../db/client";
import {
  getPlayersFromDb,
  getGoaliesFromDb,
  getAvailableSeasonsFromDb,
  getTeamIdsWithData,
  getLastModifiedFromDb,
} from "../db/queries";
import type { PlayerWithSeason, GoalieWithSeason } from "../types";

const mockExecute = (getDbClient() as unknown as { execute: jest.Mock }).execute;

describe("db/queries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getPlayersFromDb", () => {
    test("returns mapped PlayerWithSeason array", async () => {
      mockExecute.mockResolvedValue({
        rows: [
          {
            name: "Connor McDavid",
            position: "F",
            games: 82,
            goals: 50,
            assists: 75,
            points: 125,
            plus_minus: 25,
            penalties: 20,
            shots: 350,
            ppp: 40,
            shp: 5,
            hits: 30,
            blocks: 25,
            season: 2024,
          },
        ],
      });

      const result = await getPlayersFromDb("1", 2024, "regular");

      expect(mockExecute).toHaveBeenCalledWith({
        sql: expect.stringContaining("SELECT"),
        args: ["1", 2024, "regular"],
      });

      expect(result).toEqual<PlayerWithSeason[]>([
        {
          name: "Connor McDavid",
          position: "F",
          games: 82,
          goals: 50,
          assists: 75,
          points: 125,
          plusMinus: 25,
          penalties: 20,
          shots: 350,
          ppp: 40,
          shp: 5,
          hits: 30,
          blocks: 25,
          score: 0,
          scoreAdjustedByGames: 0,
          season: 2024,
        },
      ]);
    });

    test("returns empty array when no rows", async () => {
      mockExecute.mockResolvedValue({ rows: [] });
      const result = await getPlayersFromDb("1", 2024, "regular");
      expect(result).toEqual([]);
    });
  });

  describe("getGoaliesFromDb", () => {
    test("returns mapped GoalieWithSeason array with gaa/savePercent as strings", async () => {
      mockExecute.mockResolvedValue({
        rows: [
          {
            name: "Carey Price",
            games: 70,
            wins: 40,
            saves: 2000,
            shutouts: 10,
            goals: 5,
            assists: 10,
            points: 15,
            penalties: 15,
            ppp: 2,
            shp: 1,
            gaa: 2.3,
            save_percent: 0.92,
            season: 2024,
          },
        ],
      });

      const result = await getGoaliesFromDb("1", 2024, "regular");

      expect(result).toEqual<GoalieWithSeason[]>([
        {
          name: "Carey Price",
          games: 70,
          wins: 40,
          saves: 2000,
          shutouts: 10,
          goals: 5,
          assists: 10,
          points: 15,
          penalties: 15,
          ppp: 2,
          shp: 1,
          gaa: "2.3",
          savePercent: "0.92",
          score: 0,
          scoreAdjustedByGames: 0,
          season: 2024,
        },
      ]);
    });

    test("returns undefined for null gaa and save_percent", async () => {
      mockExecute.mockResolvedValue({
        rows: [
          {
            name: "Test Goalie",
            games: 5,
            wins: 2,
            saves: 100,
            shutouts: 0,
            goals: 0,
            assists: 0,
            points: 0,
            penalties: 0,
            ppp: 0,
            shp: 0,
            gaa: null,
            save_percent: null,
            season: 2024,
          },
        ],
      });

      const result = await getGoaliesFromDb("1", 2024, "regular");

      expect(result[0].gaa).toBeUndefined();
      expect(result[0].savePercent).toBeUndefined();
    });

    test("returns empty array when no rows", async () => {
      mockExecute.mockResolvedValue({ rows: [] });
      const result = await getGoaliesFromDb("1", 2024, "regular");
      expect(result).toEqual([]);
    });
  });

  describe("getAvailableSeasonsFromDb", () => {
    test("returns sorted season numbers for single report type", async () => {
      mockExecute.mockResolvedValue({
        rows: [{ season: 2014 }, { season: 2012 }, { season: 2013 }],
      });

      const result = await getAvailableSeasonsFromDb("1", "regular");

      expect(mockExecute).toHaveBeenCalledWith({
        sql: expect.stringContaining("DISTINCT season"),
        args: ["1", "regular"],
      });
      expect(result).toEqual([2012, 2013, 2014]);
    });

    test("returns empty array when no seasons", async () => {
      mockExecute.mockResolvedValue({ rows: [] });
      const result = await getAvailableSeasonsFromDb("1", "regular");
      expect(result).toEqual([]);
    });
  });

  describe("getTeamIdsWithData", () => {
    test("returns distinct team IDs from both tables", async () => {
      mockExecute.mockResolvedValue({
        rows: [{ team_id: "1" }, { team_id: "2" }, { team_id: "3" }],
      });

      const result = await getTeamIdsWithData();

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("UNION")
      );
      expect(result).toEqual(["1", "2", "3"]);
    });

    test("returns empty array when no data", async () => {
      mockExecute.mockResolvedValue({ rows: [] });
      const result = await getTeamIdsWithData();
      expect(result).toEqual([]);
    });
  });

  describe("getLastModifiedFromDb", () => {
    test("returns timestamp from import_metadata", async () => {
      mockExecute.mockResolvedValue({
        rows: [{ value: "2026-02-15T12:00:00.000Z" }],
      });

      const result = await getLastModifiedFromDb();

      expect(mockExecute).toHaveBeenCalledWith({
        sql: expect.stringContaining("import_metadata"),
        args: ["last_modified"],
      });
      expect(result).toBe("2026-02-15T12:00:00.000Z");
    });

    test("returns null when no metadata row", async () => {
      mockExecute.mockResolvedValue({ rows: [] });
      const result = await getLastModifiedFromDb();
      expect(result).toBeNull();
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx jest src/__tests__/queries.test.ts --no-coverage`
Expected: FAIL — `Cannot find module '../db/queries'`

**Step 3: Write minimal implementation**

Create `src/db/queries.ts`:

```typescript
import { getDbClient } from "./client";
import type { PlayerWithSeason, GoalieWithSeason, CsvReport } from "../types";

interface PlayerRow {
  name: string;
  position: string | null;
  games: number;
  goals: number;
  assists: number;
  points: number;
  plus_minus: number;
  penalties: number;
  shots: number;
  ppp: number;
  shp: number;
  hits: number;
  blocks: number;
  season: number;
}

interface GoalieRow {
  name: string;
  games: number;
  wins: number;
  saves: number;
  shutouts: number;
  goals: number;
  assists: number;
  points: number;
  penalties: number;
  ppp: number;
  shp: number;
  gaa: number | null;
  save_percent: number | null;
  season: number;
}

const mapPlayerRow = (row: PlayerRow): PlayerWithSeason => ({
  name: row.name,
  position: row.position ?? undefined,
  games: row.games,
  goals: row.goals,
  assists: row.assists,
  points: row.points,
  plusMinus: row.plus_minus,
  penalties: row.penalties,
  shots: row.shots,
  ppp: row.ppp,
  shp: row.shp,
  hits: row.hits,
  blocks: row.blocks,
  score: 0,
  scoreAdjustedByGames: 0,
  season: row.season,
});

const mapGoalieRow = (row: GoalieRow): GoalieWithSeason => ({
  name: row.name,
  games: row.games,
  wins: row.wins,
  saves: row.saves,
  shutouts: row.shutouts,
  goals: row.goals,
  assists: row.assists,
  points: row.points,
  penalties: row.penalties,
  ppp: row.ppp,
  shp: row.shp,
  gaa: row.gaa != null ? String(row.gaa) : undefined,
  savePercent: row.save_percent != null ? String(row.save_percent) : undefined,
  score: 0,
  scoreAdjustedByGames: 0,
  season: row.season,
});

export const getPlayersFromDb = async (
  teamId: string,
  season: number,
  reportType: CsvReport
): Promise<PlayerWithSeason[]> => {
  const db = getDbClient();
  const result = await db.execute({
    sql: `SELECT name, position, games, goals, assists, points, plus_minus,
                 penalties, shots, ppp, shp, hits, blocks, season
          FROM players
          WHERE team_id = ? AND season = ? AND report_type = ?`,
    args: [teamId, season, reportType],
  });
  return (result.rows as unknown as PlayerRow[]).map(mapPlayerRow);
};

export const getGoaliesFromDb = async (
  teamId: string,
  season: number,
  reportType: CsvReport
): Promise<GoalieWithSeason[]> => {
  const db = getDbClient();
  const result = await db.execute({
    sql: `SELECT name, games, wins, saves, shutouts, goals, assists, points,
                 penalties, ppp, shp, gaa, save_percent, season
          FROM goalies
          WHERE team_id = ? AND season = ? AND report_type = ?`,
    args: [teamId, season, reportType],
  });
  return (result.rows as unknown as GoalieRow[]).map(mapGoalieRow);
};

export const getAvailableSeasonsFromDb = async (
  teamId: string,
  reportType: CsvReport
): Promise<number[]> => {
  const db = getDbClient();
  const result = await db.execute({
    sql: `SELECT DISTINCT season FROM players
          WHERE team_id = ? AND report_type = ?
          ORDER BY season`,
    args: [teamId, reportType],
  });
  return (result.rows as unknown as { season: number }[]).map((r) => r.season);
};

export const getTeamIdsWithData = async (): Promise<string[]> => {
  const db = getDbClient();
  const result = await db.execute(
    `SELECT DISTINCT team_id FROM players
     UNION
     SELECT DISTINCT team_id FROM goalies
     ORDER BY team_id`
  );
  return (result.rows as unknown as { team_id: string }[]).map(
    (r) => r.team_id
  );
};

export const getLastModifiedFromDb = async (): Promise<string | null> => {
  const db = getDbClient();
  const result = await db.execute({
    sql: `SELECT value FROM import_metadata WHERE key = ?`,
    args: ["last_modified"],
  });
  if (!result.rows.length) return null;
  return (result.rows[0] as unknown as { value: string }).value;
};
```

**Step 4: Run tests to verify they pass**

Run: `npx jest src/__tests__/queries.test.ts --no-coverage`
Expected: All tests PASS

**Step 5: Run full verify**

Run: `npm run verify`
Expected: All checks pass, coverage at 100%.

**Step 6: Commit**

```bash
git add src/db/queries.ts src/__tests__/queries.test.ts
git commit -m "feat: add db/queries module with typed query functions and tests"
```

---

### Task 2: Refactor `src/helpers.ts` — replace filesystem/R2 with DB queries

**Files:**
- Modify: `src/helpers.ts`
- Modify: `src/__tests__/helpers.test.ts`

**Context:** `helpers.ts` currently has two concerns: (1) filesystem/R2/manifest logic for discovering seasons and teams, and (2) pure business logic (scoring, sorting, validation). Phase 2 replaces concern (1) with DB queries. The pure business logic (~550 lines of scoring code) stays completely untouched.

**What changes:**
- `listSeasonsForTeam` → calls `getAvailableSeasonsFromDb` instead of reading filesystem/manifest
- `getTeamsWithCsvFolders` → renamed to `getTeamsWithData`, calls `getTeamIdsWithData`
- `resolveTeamId` → made async, uses team data check from DB instead of `hasTeamCsvDir`
- **Removed:** `helperCaches`, `getTeamCsvDir`, `hasTeamCsvDir`, `ensureTeamCsvDirOrThrow`, `resetHelperCachesForTests`
- **Removed imports:** `fs`, `path`, `isR2Enabled` (from `./storage`), `getSeasonManifest` (from `./storage/manifest`)

**What stays untouched:**
- `ApiError` class
- All scoring functions: `applyPlayerScores`, `applyPlayerScoresByPosition`, `applyGoalieScores`
- `sortItemsByStatField`, `availableSeasons`, `seasonAvailable`, `reportTypeAvailable`, `parseSeasonParam`
- All scoring helper functions (internal): `normalizeFieldToBest`, `getMaxByField`, `getMinByField`, `applyScoresInternal`, etc.

**Step 1: Update the test file**

Rewrite the top of `src/__tests__/helpers.test.ts`:

**Remove** the top-level mocks for `fs`, `../storage/r2-client`, `../storage/manifest` (lines 1-14).

**Replace** with a mock for `../db/queries`:

```typescript
jest.mock("../db/queries", () => ({
  getAvailableSeasonsFromDb: jest.fn(),
  getTeamIdsWithData: jest.fn(),
}));
```

**Update imports** — remove `fs`, `isR2Enabled`, `getSeasonManifest`, `resetHelperCachesForTests`. Add `getAvailableSeasonsFromDb`, `getTeamIdsWithData` from `../db/queries`.

**Rename** all references from `getTeamsWithCsvFolders` to `getTeamsWithData`.

**Rewrite season/team discovery tests:**

```typescript
describe("listSeasonsForTeam", () => {
  test("returns seasons from database", async () => {
    (getAvailableSeasonsFromDb as jest.Mock).mockResolvedValue([2012, 2013, 2014]);
    const result = await listSeasonsForTeam("1", "regular");
    expect(getAvailableSeasonsFromDb).toHaveBeenCalledWith("1", "regular");
    expect(result).toEqual([2012, 2013, 2014]);
  });

  test("returns empty array when no seasons in database", async () => {
    (getAvailableSeasonsFromDb as jest.Mock).mockResolvedValue([]);
    const result = await listSeasonsForTeam("1", "regular");
    expect(result).toEqual([]);
  });
});

describe("getTeamsWithData", () => {
  test("returns configured teams that have data in database", async () => {
    (getTeamIdsWithData as jest.Mock).mockResolvedValue(["1", "2"]);
    const teams = await getTeamsWithData();
    expect(teams.length).toBe(2);
    expect(teams[0]).toMatchObject({ id: "1", name: "colorado" });
    expect(teams[1]).toMatchObject({ id: "2", name: "carolina" });
  });

  test("filters out teams not configured in TEAMS constant", async () => {
    (getTeamIdsWithData as jest.Mock).mockResolvedValue(["1", "999"]);
    const teams = await getTeamsWithData();
    expect(teams.length).toBe(1);
    expect(teams[0]).toMatchObject({ id: "1" });
  });

  test("returns empty array when no data in database", async () => {
    (getTeamIdsWithData as jest.Mock).mockResolvedValue([]);
    const teams = await getTeamsWithData();
    expect(teams).toEqual([]);
  });
});

describe("resolveTeamId", () => {
  test("returns teamId when configured and has data", async () => {
    (getTeamIdsWithData as jest.Mock).mockResolvedValue(["1", "2"]);
    const result = await resolveTeamId("2");
    expect(result).toBe("2");
  });

  test("returns default when teamId is not configured", async () => {
    (getTeamIdsWithData as jest.Mock).mockResolvedValue(["1"]);
    const result = await resolveTeamId("999");
    expect(result).toBe("1");
  });

  test("returns default when teamId has no data", async () => {
    (getTeamIdsWithData as jest.Mock).mockResolvedValue(["2"]);
    const result = await resolveTeamId("1");
    expect(result).toBe("1");
  });

  test("returns default for non-string input", async () => {
    const result = await resolveTeamId(undefined);
    expect(result).toBe("1");
  });

  test("returns default for empty string", async () => {
    const result = await resolveTeamId("");
    expect(result).toBe("1");
  });
});
```

**Remove these test blocks entirely** (they test filesystem/R2 behavior that no longer exists):
- `"memoizes listSeasonsForTeam results"` (no cache)
- `"memoizes getTeamsWithCsvFolders results"` (no cache)
- `"memoizes hasTeamCsvDir via resolveTeamId"` (no cache)
- `"hasTeamCsvDir re-throws ..."` (all 3 tests — function removed)
- `"ensureTeamCsvDirOrThrow re-throws ..."` (all 5 tests — function removed)
- `"ensureTeamCsvDirOrThrow re-throws ENOENT for unconfigured team"` (removed)
- `"ensureTeamCsvDirOrThrow re-throws undefined for unconfigured team"` (removed)
- The entire `"R2 mode"` describe block at the bottom (lines 2005-2067)

**Keep all scoring tests unchanged** (~1200 lines of scoring, sorting, `availableSeasons`, `seasonAvailable`, `reportTypeAvailable`, `parseSeasonParam` tests).

**Step 2: Run tests to verify they fail**

Run: `npx jest src/__tests__/helpers.test.ts --no-coverage`
Expected: FAIL — functions not yet updated in `helpers.ts`.

**Step 3: Update `src/helpers.ts`**

**Remove imports** (lines 1-2, 19-20):
```typescript
// REMOVE these:
import fs from "fs";
import path from "path";
import { isR2Enabled } from "./storage";
import { getSeasonManifest } from "./storage/manifest";
```

**Add import:**
```typescript
import { getAvailableSeasonsFromDb, getTeamIdsWithData } from "./db/queries";
```

**Remove** the entire `helperCaches` object, `resetHelperCachesForTests`, `getTeamCsvDir`, `hasTeamCsvDir` functions (~lines 33-70).

**Replace `getTeamsWithCsvFolders`** (rename to `getTeamsWithData`, make async):

```typescript
export const getTeamsWithData = async (): Promise<Array<(typeof TEAMS)[number]>> => {
  const teamIds = await getTeamIdsWithData();
  const teamIdSet = new Set(teamIds);
  return TEAMS.filter((team) => teamIdSet.has(team.id));
};
```

**Replace `resolveTeamId`** (make async):

```typescript
export const resolveTeamId = async (raw: unknown): Promise<string> => {
  if (typeof raw !== "string") return DEFAULT_TEAM_ID;
  const teamId = raw.trim();
  if (!teamId) return DEFAULT_TEAM_ID;

  if (!isConfiguredTeamId(teamId)) return DEFAULT_TEAM_ID;
  const teams = await getTeamsWithData();
  return teams.some((t) => t.id === teamId) ? teamId : DEFAULT_TEAM_ID;
};
```

**Remove `ensureTeamCsvDirOrThrow`** function entirely.

**Replace `listSeasonsForTeam`**:

```typescript
export const listSeasonsForTeam = async (teamId: string, reportType: CsvReport): Promise<number[]> => {
  return getAvailableSeasonsFromDb(teamId, reportType);
};
```

**Step 4: Run tests to verify they pass**

Run: `npx jest src/__tests__/helpers.test.ts --no-coverage`
Expected: All tests PASS.

**Step 5: Run full verify**

Run: `npm run verify`
Expected: Will fail — `routes.ts` and `services.ts` still import old functions and the `resolveTeamId` signature changed (sync → async). This is expected; we fix them in the next tasks.

**Note:** If verify fails only due to downstream callers of `resolveTeamId` (now async) and renamed `getTeamsWithData`, that's expected. If there are unexpected failures, investigate before continuing.

**Step 6: Commit**

```bash
git add src/helpers.ts src/__tests__/helpers.test.ts
git commit -m "refactor: replace filesystem/R2 season discovery with DB queries in helpers"
```

---

### Task 3: Refactor `src/services.ts` — replace CSV parsing with DB queries

**Files:**
- Modify: `src/services.ts`
- Modify: `src/__tests__/services.test.ts`
- Delete: `src/__tests__/services-r2.test.ts`

**Context:** `services.ts` currently reads CSV files (locally or from R2), maps raw data through `mapPlayerData`/`mapGoalieData`, then scores and sorts. After this refactor, it queries the DB directly — the mapping step is eliminated because `db/queries.ts` returns typed `PlayerWithSeason[]`/`GoalieWithSeason[]` data. The scoring, merging, and sorting logic stays untouched.

**What changes:**
- `getRawDataFromFiles` → removed (replaced by DB query calls)
- `getRawDataFromFilesForReports` → removed
- `getSeasonParam` → removed (season resolution moves inline)
- All functions now call `getPlayersFromDb` / `getGoaliesFromDb` instead of CSV parsing
- For `combined` endpoints: DB returns `PlayerWithSeason[]` directly → feed to `mapCombinedPlayerDataFromPlayersWithSeason` (already exists)
- **Removed imports:** `csv`, `path`, `fs`, `os`, `validateCsvFileOnceOrThrow`, `mapPlayerData`, `mapGoalieData`, `getStorage`, `isR2Enabled`, `RawData`, `CsvReport`
- **Added imports:** `getPlayersFromDb`, `getGoaliesFromDb` from `./db/queries`

**What stays untouched:**
- `mergePlayersSameSeason` — still needed for `both` report type
- `mergeGoaliesSameSeason` — still needed for `both` report type
- All scoring/sorting calls

**Step 1: Update the test file**

Rewrite `src/__tests__/services.test.ts`:

**Replace** the top-level mocks. Remove mocks for `csvtojson`, `../csvIntegrity`. Add mock for `../db/queries`:

```typescript
jest.mock("../db/queries", () => ({
  getPlayersFromDb: jest.fn(),
  getGoaliesFromDb: jest.fn(),
}));

jest.mock("../helpers");
jest.mock("../mappings");
```

**Update imports:**

```typescript
import {
  getPlayersFromDb,
  getGoaliesFromDb,
} from "../db/queries";
import {
  getAvailableSeasons,
  getPlayersStatsSeason,
  getGoaliesStatsSeason,
  getPlayersStatsCombined,
  getGoaliesStatsCombined,
} from "../services";
import {
  availableSeasons,
  sortItemsByStatField,
  applyPlayerScores,
  applyPlayerScoresByPosition,
  applyGoalieScores,
} from "../helpers";
import {
  mapAvailableSeasons,
  mapCombinedPlayerDataFromPlayersWithSeason,
  mapCombinedGoalieDataFromGoaliesWithSeason,
  mapCombinedPlayerData,
  mapCombinedGoalieData,
} from "../mappings";
import { mockPlayer, mockGoalie } from "./fixtures";
```

**Rewrite test cases** to mock DB queries instead of csvtojson:

For `getPlayersStatsSeason`:
```typescript
describe("getPlayersStatsSeason", () => {
  beforeEach(() => {
    (availableSeasons as jest.Mock).mockReturnValue([2012, 2013, 2024]);
    (getPlayersFromDb as jest.Mock).mockResolvedValue([mockPlayer]);
    (applyPlayerScores as jest.Mock).mockImplementation((data) => data);
    (applyPlayerScoresByPosition as jest.Mock).mockImplementation((data) => data);
    (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);
  });

  test("fetches player stats from DB and sorts", async () => {
    const result = await getPlayersStatsSeason("regular", 2024);
    expect(getPlayersFromDb).toHaveBeenCalledWith("1", 2024, "regular");
    expect(applyPlayerScores).toHaveBeenCalledWith([mockPlayer]);
    expect(sortItemsByStatField).toHaveBeenCalledWith([mockPlayer], "players");
    expect(result).toEqual([mockPlayer]);
  });

  test("uses max season when season is undefined", async () => {
    await getPlayersStatsSeason("regular", undefined);
    expect(getPlayersFromDb).toHaveBeenCalledWith("1", 2024, "regular");
  });

  test("returns empty array when no seasons available", async () => {
    (availableSeasons as jest.Mock).mockReturnValue([]);
    (applyPlayerScores as jest.Mock).mockImplementation((data) => data);
    (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);

    const result = await getPlayersStatsSeason("regular", undefined);
    expect(result).toEqual([]);
    expect(getPlayersFromDb).not.toHaveBeenCalled();
  });

  test("when reportType is both, queries regular+playoffs and merges", async () => {
    const regular = { ...mockPlayer, name: "Jamie Benn", season: 2024, games: 12, points: 6 };
    const playoffs = { ...mockPlayer, name: "Jamie Benn", season: 2024, games: 4, points: 3 };
    (getPlayersFromDb as jest.Mock)
      .mockResolvedValueOnce([regular])
      .mockResolvedValueOnce([playoffs]);
    (applyPlayerScores as jest.Mock).mockImplementation((data) => data);
    (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);

    await getPlayersStatsSeason("both", 2024);

    expect(getPlayersFromDb).toHaveBeenCalledWith("1", 2024, "regular");
    expect(getPlayersFromDb).toHaveBeenCalledWith("1", 2024, "playoffs");
    expect(applyPlayerScores).toHaveBeenCalledWith([
      expect.objectContaining({ name: "Jamie Benn", games: 16, points: 9 }),
    ]);
  });
});
```

Similar pattern for `getGoaliesStatsSeason`, `getPlayersStatsCombined`, `getGoaliesStatsCombined`.

**Remove the entire `"CSV error handling"` describe block** — CSV errors no longer apply. DB errors propagate naturally through the existing `withErrorHandlingCached` in routes.

**Delete** `src/__tests__/services-r2.test.ts` entirely — R2-specific CSV reading behavior no longer exists.

**Step 2: Run tests to verify they fail**

Run: `npx jest src/__tests__/services.test.ts --no-coverage`
Expected: FAIL — `services.ts` still imports CSV modules.

**Step 3: Rewrite `src/services.ts`**

```typescript
import {
  availableSeasons,
  sortItemsByStatField,
  applyPlayerScores,
  applyPlayerScoresByPosition,
  applyGoalieScores,
} from "./helpers";
import {
  mapAvailableSeasons,
  mapCombinedPlayerData,
  mapCombinedGoalieData,
  mapCombinedPlayerDataFromPlayersWithSeason,
  mapCombinedGoalieDataFromGoaliesWithSeason,
} from "./mappings";
import { getPlayersFromDb, getGoaliesFromDb } from "./db/queries";
import { Report, CsvReport, PlayerWithSeason, GoalieWithSeason } from "./types";
import { DEFAULT_TEAM_ID } from "./constants";

const getSeasonParam = async (teamId: string, report: Report, season?: number): Promise<number[]> => {
  if (season !== undefined) return [season];
  const seasons = await availableSeasons(teamId, report);
  if (!seasons.length) return [];
  return [Math.max(...seasons)];
};

const getPlayersForSeasons = async (
  teamId: string,
  reportType: CsvReport,
  seasons: number[]
): Promise<PlayerWithSeason[]> => {
  if (!seasons.length) return [];
  const results = await Promise.all(
    seasons.map((season) => getPlayersFromDb(teamId, season, reportType))
  );
  return results.flat();
};

const getGoaliesForSeasons = async (
  teamId: string,
  reportType: CsvReport,
  seasons: number[]
): Promise<GoalieWithSeason[]> => {
  if (!seasons.length) return [];
  const results = await Promise.all(
    seasons.map((season) => getGoaliesFromDb(teamId, season, reportType))
  );
  return results.flat();
};

const mergePlayersSameSeason = (players: PlayerWithSeason[]): PlayerWithSeason[] => {
  // ... stays identical to current implementation ...
};

const mergeGoaliesSameSeason = (goalies: GoalieWithSeason[]): GoalieWithSeason[] => {
  // ... stays identical to current implementation ...
};

export const getAvailableSeasons = async (
  teamId: string = DEFAULT_TEAM_ID,
  reportType: Report = "regular",
  startFrom?: number
) => {
  const concreteReport: CsvReport = reportType === "both" ? "regular" : reportType;
  let seasons = await availableSeasons(teamId, concreteReport);
  if (startFrom !== undefined) {
    seasons = seasons.filter((season) => season >= startFrom);
  }
  return mapAvailableSeasons(seasons);
};

export const getPlayersStatsSeason = async (
  report: Report,
  season?: number,
  teamId: string = DEFAULT_TEAM_ID
) => {
  const seasons = await getSeasonParam(teamId, report, season);
  if (report === "both") {
    const [regular, playoffs] = await Promise.all([
      getPlayersForSeasons(teamId, "regular", seasons),
      getPlayersForSeasons(teamId, "playoffs", seasons),
    ]);
    const merged = mergePlayersSameSeason([...regular, ...playoffs]);
    const scoredData = applyPlayerScores(merged);
    applyPlayerScoresByPosition(scoredData);
    return sortItemsByStatField(scoredData, "players");
  }
  const players = await getPlayersForSeasons(teamId, report, seasons);
  const scoredData = applyPlayerScores(players);
  applyPlayerScoresByPosition(scoredData);
  return sortItemsByStatField(scoredData, "players");
};

export const getGoaliesStatsSeason = async (
  report: Report,
  season?: number,
  teamId: string = DEFAULT_TEAM_ID
) => {
  const seasons = await getSeasonParam(teamId, report, season);
  if (report === "both") {
    const [regular, playoffs] = await Promise.all([
      getGoaliesForSeasons(teamId, "regular", seasons),
      getGoaliesForSeasons(teamId, "playoffs", seasons),
    ]);
    const merged = mergeGoaliesSameSeason([...regular, ...playoffs]);
    const scoredData = applyGoalieScores(merged);
    return sortItemsByStatField(scoredData, "goalies");
  }
  const goalies = await getGoaliesForSeasons(teamId, report, seasons);
  const scoredData = applyGoalieScores(goalies);
  return sortItemsByStatField(scoredData, "goalies");
};

export const getPlayersStatsCombined = async (
  report: Report,
  teamId: string = DEFAULT_TEAM_ID,
  startFrom?: number
) => {
  if (report === "both") {
    let seasons = await availableSeasons(teamId, "both");
    if (startFrom !== undefined) {
      seasons = seasons.filter((season) => season >= startFrom);
    }
    const [regular, playoffs] = await Promise.all([
      getPlayersForSeasons(teamId, "regular", seasons),
      getPlayersForSeasons(teamId, "playoffs", seasons),
    ]);
    const mergedBySeason = mergePlayersSameSeason([...regular, ...playoffs]);
    const combined = mapCombinedPlayerDataFromPlayersWithSeason(mergedBySeason);
    const scored = applyPlayerScores(combined);
    applyPlayerScoresByPosition(scored);
    return sortItemsByStatField(scored, "players");
  }

  let seasons = await availableSeasons(teamId, report);
  if (startFrom !== undefined) {
    seasons = seasons.filter((season) => season >= startFrom);
  }
  const players = await getPlayersForSeasons(teamId, report as CsvReport, seasons);
  const combined = mapCombinedPlayerDataFromPlayersWithSeason(players);
  const scored = applyPlayerScores(combined);
  applyPlayerScoresByPosition(scored);
  return sortItemsByStatField(scored, "players");
};

export const getGoaliesStatsCombined = async (
  report: Report,
  teamId: string = DEFAULT_TEAM_ID,
  startFrom?: number
) => {
  if (report === "both") {
    let seasons = await availableSeasons(teamId, "both");
    if (startFrom !== undefined) {
      seasons = seasons.filter((season) => season >= startFrom);
    }
    const [regular, playoffs] = await Promise.all([
      getGoaliesForSeasons(teamId, "regular", seasons),
      getGoaliesForSeasons(teamId, "playoffs", seasons),
    ]);
    const mergedBySeason = mergeGoaliesSameSeason([...regular, ...playoffs]);
    const combined = mapCombinedGoalieDataFromGoaliesWithSeason(mergedBySeason);
    const scored = applyGoalieScores(combined);
    return sortItemsByStatField(scored, "goalies");
  }

  let seasons = await availableSeasons(teamId, report);
  if (startFrom !== undefined) {
    seasons = seasons.filter((season) => season >= startFrom);
  }
  const goalies = await getGoaliesForSeasons(teamId, report as CsvReport, seasons);
  const combined = mapCombinedGoalieDataFromGoaliesWithSeason(goalies);
  const scored = applyGoalieScores(combined);
  return sortItemsByStatField(scored, "goalies");
};
```

**Important note on `mapCombinedPlayerData` / `mapCombinedGoalieData`:** These are no longer needed in `services.ts` because they call `mapPlayerData(rawData)` internally, which was CSV-specific. We use the `FromPlayersWithSeason` / `FromGoaliesWithSeason` variants instead. However, the `mappings.ts` functions themselves don't change — they're still imported by `services.ts` tests and potentially by the import scripts.

**Step 4: Run tests to verify they pass**

Run: `npx jest src/__tests__/services.test.ts --no-coverage`
Expected: All tests PASS.

**Step 5: Run full verify**

Run: `npm run verify`
Expected: May still fail due to `routes.ts` needing updates (Task 4). If only route-related failures, proceed to Task 4.

**Step 6: Commit**

```bash
git add src/services.ts src/__tests__/services.test.ts
git rm src/__tests__/services-r2.test.ts
git commit -m "refactor: replace CSV parsing with DB queries in services"
```

---

### Task 4: Refactor `src/routes.ts` — update `getLastModified` and `resolveTeamId` callers

**Files:**
- Modify: `src/routes.ts`
- Modify: `src/__tests__/routes.test.ts`

**Context:** Two changes needed: (1) `getLastModified` route switches from filesystem/R2 to DB query, (2) all routes update to `await resolveTeamId(...)` since it's now async. Also rename `getTeamsWithCsvFolders` to `getTeamsWithData`.

**What changes:**
- `getLastModified` handler: replace R2/filesystem reading with `getLastModifiedFromDb`
- All route handlers: `await resolveTeamId(...)` (was synchronous)
- `getTeams` handler: call `getTeamsWithData` instead of `getTeamsWithCsvFolders`
- **Removed imports:** `fs`, `path`, `isR2Enabled`, `getR2Client`
- **Added imports:** `getLastModifiedFromDb` from `./db/queries`

**Step 1: Update the test file**

In `src/__tests__/routes.test.ts`:

**Remove** the `jest.mock("fs")` and the R2 client mock block:
```typescript
// REMOVE:
jest.mock("fs");
jest.mock("../storage/r2-client", () => { ... });
```

**Add** mock for DB queries:
```typescript
jest.mock("../db/queries", () => ({
  getLastModifiedFromDb: jest.fn(),
}));
```

**Update imports:**
- Remove: `fs` import
- Add: `import { getLastModifiedFromDb } from "../db/queries";`
- Change: `getTeamsWithCsvFolders` → `getTeamsWithData` everywhere

**Update `resolveTeamId` mock** to return a promise:
```typescript
(resolveTeamId as jest.Mock).mockResolvedValue("1");
```

**Rewrite `getLastModified` tests:**

```typescript
describe("getLastModified", () => {
  test("returns 200 with timestamp from database", async () => {
    (getLastModifiedFromDb as jest.Mock).mockResolvedValue("2026-01-30T15:30:00.000Z");

    const req = createRequest({ url: "/last-modified" });
    const res = createResponse();
    await getLastModified(asRouteReq(req), res);

    expect(getLastModifiedFromDb).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, {
      lastModified: "2026-01-30T15:30:00.000Z",
    });
  });

  test("returns null when no metadata in database", async () => {
    (getLastModifiedFromDb as jest.Mock).mockResolvedValue(null);

    const req = createRequest({ url: "/last-modified" });
    const res = createResponse();
    await getLastModified(asRouteReq(req), res);

    expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, {
      lastModified: null,
    });
  });

  // Keep caching/etag/304 tests — just update the setup to use mock DB instead of fs
  test("memoizes successful responses", async () => {
    (getLastModifiedFromDb as jest.Mock).mockResolvedValue("2026-01-28T10:00:00.000Z");

    const req1 = createRequest({ url: "/last-modified" });
    const res1 = createResponse();
    await getLastModified(asRouteReq(req1), res1);

    jest.clearAllMocks();

    const req2 = createRequest({ url: "/last-modified" });
    const res2 = createResponse();
    await getLastModified(asRouteReq(req2), res2);

    expect(getLastModifiedFromDb).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(res2, HTTP_STATUS.OK, {
      lastModified: "2026-01-28T10:00:00.000Z",
    });
  });

  // Keep existing etag/304 tests with same structure, just update mock setup
  // ...
});
```

**Remove** the entire `"R2 mode"` nested describe block inside `getLastModified` — no more R2/filesystem branching.

**Step 2: Run tests to verify they fail**

Run: `npx jest src/__tests__/routes.test.ts --no-coverage`
Expected: FAIL — `routes.ts` still imports old modules.

**Step 3: Update `src/routes.ts`**

**Remove imports:**
```typescript
// REMOVE:
import fs from "fs";
import path from "path";
import { isR2Enabled } from "./storage";
import { getR2Client } from "./storage/r2-client";
```

**Add import:**
```typescript
import { getLastModifiedFromDb } from "./db/queries";
```

**Rename** `getTeamsWithCsvFolders` to `getTeamsWithData` in import and usage.

**Add `await`** to all `resolveTeamId(...)` calls:
```typescript
const teamId = await resolveTeamId(getQueryParam(req, "teamId"));
```

**Rewrite `getLastModified` handler:**
```typescript
export const getLastModified: AugmentedRequestHandler = async (req, res) => {
  await withErrorHandlingCached(req, res, async () => {
    const lastModified = await getLastModifiedFromDb();
    return { lastModified };
  });
};
```

**Step 4: Run tests to verify they pass**

Run: `npx jest src/__tests__/routes.test.ts --no-coverage`
Expected: All tests PASS.

**Step 5: Run full verify**

Run: `npm run verify`
Expected: All checks pass (assuming Tasks 1-3 are also complete).

**Step 6: Commit**

```bash
git add src/routes.ts src/__tests__/routes.test.ts
git commit -m "refactor: replace R2/filesystem with DB queries in routes, make resolveTeamId async"
```

---

### Task 5: Remove orphaned modules and their tests

**Files:**
- Delete: `src/storage/index.ts`
- Delete: `src/storage/manifest.ts`
- Delete: `src/csvIntegrity.ts`
- Delete: `src/__tests__/storage.test.ts`
- Delete: `src/__tests__/services-r2.test.ts` (if not already deleted in Task 3)
- Delete: `src/__tests__/csvIntegrity.test.ts`
- Keep: `src/storage/r2-client.ts` (still used by `scripts/upload-to-r2.ts`)

**Context:** After Tasks 2-4, these modules have zero runtime importers. `r2-client.ts` stays because the R2 upload script still needs it.

**Step 1: Verify no remaining imports**

Search the codebase for any remaining imports of these modules:

```bash
grep -r "from.*storage/index\|from.*storage/manifest\|from.*csvIntegrity\|from.*storage\"" src/ --include="*.ts" | grep -v "__tests__" | grep -v "r2-client"
```

Expected: No matches (or only `storage/r2-client` imports from scripts).

**Step 2: Delete the files**

```bash
git rm src/storage/index.ts
git rm src/storage/manifest.ts
git rm src/csvIntegrity.ts
git rm src/__tests__/storage.test.ts
git rm src/__tests__/csvIntegrity.test.ts
```

If `src/__tests__/services-r2.test.ts` wasn't deleted in Task 3:
```bash
git rm src/__tests__/services-r2.test.ts
```

**Step 3: Update `jest.config.js` if needed**

Check if any coverage exclusions reference removed files. Current exclusions:
- `!src/storage/r2-client.ts` — KEEP (file still exists)
- `!src/db/client.ts` — KEEP

No changes needed.

**Step 4: Run full verify**

Run: `npm run verify`
Expected: All checks pass, coverage at 100%.

**Step 5: Commit**

```bash
git commit -m "chore: remove orphaned CSV/R2 runtime modules (storage/index, manifest, csvIntegrity)"
```

---

### Task 6: Update documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/DEVELOPMENT.md`
- Modify: `docs/TESTING.md`

**Context:** Phase 2 design requirement: documentation must be updated after every phase.

**Step 1: Update `README.md`**

In the "Database (Turso/SQLite)" section:
- Update to reflect that the **API now reads from the database** (not just for import)
- Remove any references to "CSV-based data layer" in the API description
- Update the Features section if it mentions CSV
- Update the Roadmap to strikethrough Phase 2

**Step 2: Update `docs/DEVELOPMENT.md`**

- Update the architecture description to reflect DB as primary data source
- Remove references to R2/CSV as the API data source
- Keep R2 upload references (still used for import pipeline)
- Update the "how it works" flow diagram if one exists

**Step 3: Update `docs/TESTING.md`**

- Document the new `db/queries` mock pattern for tests
- Remove documentation about CSV/R2 mocking in services tests (no longer applicable)
- Note that `services-r2.test.ts` was removed

**Step 4: Run full verify**

Run: `npm run verify`
Expected: All checks pass.

**Step 5: Commit**

```bash
git add README.md docs/DEVELOPMENT.md docs/TESTING.md
git commit -m "docs: update documentation for Phase 2 (API reads from database)"
```

---

## Summary of Changes

| File | Action | Reason |
|------|--------|--------|
| `src/db/queries.ts` | CREATE | New DB query layer with column mapping |
| `src/__tests__/queries.test.ts` | CREATE | Tests for all query functions |
| `src/helpers.ts` | MODIFY | Replace filesystem/R2/manifest with DB queries |
| `src/__tests__/helpers.test.ts` | MODIFY | Remove ~30 fs/R2 tests, add ~10 DB tests |
| `src/services.ts` | MODIFY | Replace CSV parsing with DB queries |
| `src/__tests__/services.test.ts` | MODIFY | Mock DB queries instead of csvtojson |
| `src/routes.ts` | MODIFY | Replace fs/R2 in getLastModified, async resolveTeamId |
| `src/__tests__/routes.test.ts` | MODIFY | Remove R2 mode tests, mock DB query |
| `src/storage/index.ts` | DELETE | No runtime importers |
| `src/storage/manifest.ts` | DELETE | No runtime importers |
| `src/csvIntegrity.ts` | DELETE | No runtime importers |
| `src/__tests__/storage.test.ts` | DELETE | Tests orphaned module |
| `src/__tests__/services-r2.test.ts` | DELETE | Tests R2-specific CSV reading |
| `src/__tests__/csvIntegrity.test.ts` | DELETE | Tests orphaned module |
| `README.md` | MODIFY | Update for Phase 2 |
| `docs/DEVELOPMENT.md` | MODIFY | Update for Phase 2 |
| `docs/TESTING.md` | MODIFY | Update mock patterns |

**Key invariants maintained:**
- All scoring, sorting, and mapping logic is completely untouched
- HTTP ETag/304 caching continues to work identically
- `npm run verify` passes after every task
- Coverage remains at 100%
- `src/storage/r2-client.ts` stays (used by upload script)
- `src/db/client.ts` stays excluded from coverage (same pattern as `r2-client.ts`)
