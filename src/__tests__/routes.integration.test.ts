import fs from "fs/promises";
import path from "path";
import { createRequest, createResponse } from "node-mocks-http";
import {
  getCareerPlayer,
  getCareerGoalie,
  getCareerPlayers,
  getCareerGoalies,
  getSeasons,
  getGoaliesSeason,
  getGoaliesCombined,
  getLastModified,
  getPlayersCombined,
  getPlayersSeason,
  getPlayoffsLeaderboard,
  getRegularLeaderboard,
} from "../routes";
import { ERROR_MESSAGES, HTTP_STATUS } from "../constants";
import { createIntegrationDb } from "./integration-db";

type RouteReq = Parameters<typeof getPlayersSeason>[0];
type MockResponse = ReturnType<typeof createResponse>;

const asRouteReq = (req: unknown): RouteReq => req as RouteReq;

const getJsonBody = <T>(res: MockResponse): T => res._getJSONData() as T;

const writeSnapshot = async (
  snapshotDir: string,
  snapshotKey: string,
  payload: unknown,
): Promise<void> => {
  const filePath = path.join(snapshotDir, `${snapshotKey}.json`);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload), "utf8");
};

describe("routes integration", () => {
  test("returns regular seasons for the default team from the real helper range", async () => {
    const db = await createIntegrationDb();

    try {
      const req = createRequest({
        method: "GET",
        url: "/seasons",
      });
      const res = createResponse();

      await getSeasons(asRouteReq(req), res);

      const body = getJsonBody<Array<Record<string, unknown>>>(res);
      expect(res.statusCode).toBe(HTTP_STATUS.OK);
      expect(res.getHeader("x-stats-data-source")).toBe("db");
      expect(body[0]).toEqual({ season: 2012, text: "2012-2013" });
      expect(body.at(-1)).toEqual({ season: 2025, text: "2025-2026" });
    } finally {
      await db.cleanup();
    }
  });

  test("returns filtered seasons for both-report requests using the real helper range", async () => {
    const db = await createIntegrationDb();

    try {
      const req = createRequest({
        method: "GET",
        url: "/seasons/both?teamId=32&startFrom=2020",
        params: { reportType: "both" },
        headers: { host: "localhost" },
      });
      const res = createResponse();

      await getSeasons(asRouteReq(req), res);

      const body = getJsonBody<Array<Record<string, unknown>>>(res);
      expect(res.statusCode).toBe(HTTP_STATUS.OK);
      expect(res.getHeader("x-stats-data-source")).toBe("db");
      expect(body).toEqual([
        { season: 2020, text: "2020-2021" },
        { season: 2021, text: "2021-2022" },
        { season: 2022, text: "2022-2023" },
        { season: 2023, text: "2023-2024" },
        { season: 2024, text: "2024-2025" },
        { season: 2025, text: "2025-2026" },
      ]);
    } finally {
      await db.cleanup();
    }
  });

  test("returns playoff seasons from the live DB and honors teamId/startFrom", async () => {
    const db = await createIntegrationDb();

    try {
      await db.insertPlayers([
        {
          teamId: "19",
          season: 2023,
          reportType: "playoffs",
          playerId: "p-playoff-2023",
          name: "Playoff Skater",
          position: "F",
          games: 3,
          goals: 1,
          assists: 1,
          points: 2,
        },
        {
          teamId: "19",
          season: 2024,
          reportType: "playoffs",
          playerId: "p-playoff-2024",
          name: "Playoff Skater",
          position: "F",
          games: 4,
          goals: 2,
          assists: 2,
          points: 4,
        },
      ]);

      const req = createRequest({
        method: "GET",
        url: "/seasons/playoffs?teamId=19&startFrom=2024",
        params: { reportType: "playoffs" },
        headers: { host: "localhost" },
      });
      const res = createResponse();

      await getSeasons(asRouteReq(req), res);

      expect(res.statusCode).toBe(HTTP_STATUS.OK);
      expect(res.getHeader("x-stats-data-source")).toBe("db");
      expect(getJsonBody(res)).toEqual([
        { season: 2024, text: "2024-2025" },
      ]);
    } finally {
      await db.cleanup();
    }
  });

  test("returns 400 for unavailable playoff season using the real DB season lookup", async () => {
    const db = await createIntegrationDb();

    try {
      await db.insertPlayers([
        {
          teamId: "1",
          season: 2024,
          reportType: "playoffs",
          playerId: "p-playoff",
          name: "Playoff Only",
          position: "F",
          games: 4,
          goals: 2,
          assists: 2,
          points: 4,
        },
      ]);

      const req = createRequest({
        method: "GET",
        url: "/players/season/playoffs/2023?teamId=1",
        params: { reportType: "playoffs", season: "2023" },
      });
      const res = createResponse();

      await getPlayersSeason(asRouteReq(req), res);

      expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(res._getData()).toBe(ERROR_MESSAGES.SEASON_NOT_AVAILABLE);
      expect(res.getHeader("cache-control")).toBe("private, no-store");
    } finally {
      await db.cleanup();
    }
  });

  test("returns player season rows from the live DB", async () => {
    const db = await createIntegrationDb();

    try {
      await db.insertPlayers([
        {
          teamId: "1",
          season: 2024,
          reportType: "regular",
          playerId: "p-season",
          name: "Season Skater",
          position: "F",
          games: 12,
          goals: 5,
          assists: 7,
          points: 12,
          plusMinus: 4,
          penalties: 3,
          shots: 24,
          ppp: 2,
          hits: 6,
          blocks: 4,
        },
      ]);

      const req = createRequest({
        method: "GET",
        url: "/players/season/regular/2024?teamId=1",
        params: { reportType: "regular", season: "2024" },
      });
      const res = createResponse();

      await getPlayersSeason(asRouteReq(req), res);

      const body = getJsonBody<Array<Record<string, unknown>>>(res);
      expect(res.statusCode).toBe(HTTP_STATUS.OK);
      expect(res.getHeader("x-stats-data-source")).toBe("db");
      expect(body).toHaveLength(1);
      expect(body[0]).toEqual(
        expect.objectContaining({
          id: "p-season",
          name: "Season Skater",
          position: "F",
          games: 12,
          goals: 5,
          assists: 7,
          points: 12,
        }),
      );
    } finally {
      await db.cleanup();
    }
  });

  test("merges regular and playoff goalie stats in combined both route without leaking rate fields", async () => {
    const db = await createIntegrationDb();

    try {
      await db.insertGoalies([
        {
          teamId: "1",
          season: 2024,
          reportType: "regular",
          goalieId: "g-combined",
          name: "Merged Goalie",
          games: 10,
          wins: 6,
          saves: 300,
          shutouts: 2,
          goals: 0,
          assists: 1,
          points: 1,
          gaa: 2.2,
          savePercent: 0.92,
        },
        {
          teamId: "1",
          season: 2024,
          reportType: "playoffs",
          goalieId: "g-combined",
          name: "Merged Goalie",
          games: 4,
          wins: 2,
          saves: 120,
          shutouts: 1,
          goals: 0,
          assists: 0,
          points: 0,
          gaa: 1.8,
          savePercent: 0.935,
        },
      ]);

      const req = createRequest({
        method: "GET",
        url: "/goalies/combined/both?teamId=1&startFrom=2024",
        params: { reportType: "both" },
      });
      const res = createResponse();

      await getGoaliesCombined(asRouteReq(req), res);

      const body = getJsonBody<Array<Record<string, unknown>>>(res);
      expect(res.statusCode).toBe(HTTP_STATUS.OK);
      expect(res.getHeader("x-stats-data-source")).toBe("db");
      expect(body).toHaveLength(1);
      expect(body[0]).toEqual(
        expect.objectContaining({
          id: "g-combined",
          name: "Merged Goalie",
          games: 14,
          wins: 8,
          saves: 420,
          shutouts: 3,
          assists: 1,
          points: 1,
        }),
      );
      expect(body[0]).not.toHaveProperty("gaa");
      expect(body[0]).not.toHaveProperty("savePercent");
    } finally {
      await db.cleanup();
    }
  });

  test("returns combined player data from the live DB and honors startFrom", async () => {
    const db = await createIntegrationDb();

    try {
      await db.insertPlayers([
        {
          teamId: "1",
          season: 2023,
          reportType: "regular",
          playerId: "p-combined",
          name: "Combined Skater",
          position: "F",
          games: 8,
          goals: 3,
          assists: 4,
          points: 7,
          plusMinus: 1,
          penalties: 2,
          shots: 14,
          ppp: 1,
          hits: 4,
          blocks: 3,
        },
        {
          teamId: "1",
          season: 2024,
          reportType: "regular",
          playerId: "p-combined",
          name: "Combined Skater",
          position: "F",
          games: 10,
          goals: 5,
          assists: 6,
          points: 11,
          plusMinus: 3,
          penalties: 1,
          shots: 20,
          ppp: 2,
          shp: 1,
          hits: 7,
          blocks: 6,
        },
      ]);

      const req = createRequest({
        method: "GET",
        url: "/players/combined/regular?teamId=1&startFrom=2024",
        params: { reportType: "regular" },
        headers: { host: "localhost" },
      });
      const res = createResponse();

      await getPlayersCombined(asRouteReq(req), res);

      const body = getJsonBody<Array<Record<string, unknown>>>(res);
      expect(res.statusCode).toBe(HTTP_STATUS.OK);
      expect(res.getHeader("x-stats-data-source")).toBe("db");
      expect(body).toHaveLength(1);
      expect(body[0]).toEqual(
        expect.objectContaining({
          id: "p-combined",
          name: "Combined Skater",
          games: 10,
          goals: 5,
          assists: 6,
          points: 11,
        }),
      );
      expect(body[0].seasons).toEqual([
        expect.objectContaining({
          season: 2024,
          games: 10,
          points: 11,
        }),
      ]);
    } finally {
      await db.cleanup();
    }
  });

  test("serves player combined snapshots from local snapshot storage", async () => {
    const db = await createIntegrationDb();

    try {
      const snapshotPayload = [
        {
          id: "p-snapshot",
          name: "Snapshot Skater",
          position: "F",
          games: 99,
          goals: 44,
          assists: 55,
          points: 99,
          plusMinus: 11,
          penalties: 12,
          shots: 320,
          ppp: 22,
          shp: 1,
          hits: 80,
          blocks: 42,
          score: 100,
          scoreAdjustedByGames: 100,
          seasons: [],
        },
      ];
      await writeSnapshot(
        db.snapshotDir,
        "players/combined/regular/team-1",
        snapshotPayload,
      );

      const req = createRequest({
        method: "GET",
        url: "/players/combined/regular",
        params: { reportType: "regular" },
      });
      const res = createResponse();

      await getPlayersCombined(asRouteReq(req), res);

      expect(res.statusCode).toBe(HTTP_STATUS.OK);
      expect(res.getHeader("x-stats-data-source")).toBe("snapshot");
      expect(getJsonBody(res)).toEqual(snapshotPayload);
    } finally {
      await db.cleanup();
    }
  });

  test("uses player combined snapshots when startFrom matches the default window", async () => {
    const db = await createIntegrationDb();

    try {
      const snapshotPayload = [
        {
          id: "p-default-window",
          name: "Default Window Skater",
          position: "F",
          games: 55,
          goals: 21,
          assists: 34,
          points: 55,
          plusMinus: 9,
          penalties: 10,
          shots: 210,
          ppp: 11,
          shp: 1,
          hits: 20,
          blocks: 18,
          score: 100,
          scoreAdjustedByGames: 100,
          seasons: [],
        },
      ];
      await writeSnapshot(
        db.snapshotDir,
        "players/combined/regular/team-1",
        snapshotPayload,
      );

      const req = createRequest({
        method: "GET",
        url: "/players/combined/regular?startFrom=2012",
        params: { reportType: "regular" },
        headers: { host: "localhost" },
      });
      const res = createResponse();

      await getPlayersCombined(asRouteReq(req), res);

      expect(res.statusCode).toBe(HTTP_STATUS.OK);
      expect(res.getHeader("x-stats-data-source")).toBe("snapshot");
      expect(getJsonBody(res)).toEqual(snapshotPayload);
    } finally {
      await db.cleanup();
    }
  });

  test("returns goalie season rows from the live DB", async () => {
    const db = await createIntegrationDb();

    try {
      await db.insertGoalies([
        {
          teamId: "1",
          season: 2024,
          reportType: "regular",
          goalieId: "g-season",
          name: "Season Goalie",
          games: 12,
          wins: 8,
          saves: 340,
          shutouts: 2,
          goals: 0,
          assists: 1,
          points: 1,
          gaa: 2.15,
          savePercent: 0.918,
        },
      ]);

      const req = createRequest({
        method: "GET",
        url: "/goalies/season/regular/2024?teamId=1",
        params: { reportType: "regular", season: "2024" },
      });
      const res = createResponse();

      await getGoaliesSeason(asRouteReq(req), res);

      const body = getJsonBody<Array<Record<string, unknown>>>(res);
      expect(res.statusCode).toBe(HTTP_STATUS.OK);
      expect(res.getHeader("x-stats-data-source")).toBe("db");
      expect(body).toHaveLength(1);
      expect(body[0]).toEqual(
        expect.objectContaining({
          id: "g-season",
          name: "Season Goalie",
          games: 12,
          wins: 8,
          saves: 340,
          shutouts: 2,
          savePercent: "0.918",
          gaa: "2.15",
        }),
      );
    } finally {
      await db.cleanup();
    }
  });

  test("returns 400 for unavailable goalie season using the real DB season lookup", async () => {
    const db = await createIntegrationDb();

    try {
      await db.insertGoalies([
        {
          teamId: "1",
          season: 2024,
          reportType: "playoffs",
          goalieId: "g-playoff",
          name: "Playoff Goalie",
          games: 4,
          wins: 2,
          saves: 100,
          shutouts: 1,
          gaa: 2.1,
          savePercent: 0.925,
        },
      ]);

      const req = createRequest({
        method: "GET",
        url: "/goalies/season/playoffs/2023?teamId=1",
        params: { reportType: "playoffs", season: "2023" },
      });
      const res = createResponse();

      await getGoaliesSeason(asRouteReq(req), res);

      expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(res._getData()).toBe(ERROR_MESSAGES.SEASON_NOT_AVAILABLE);
      expect(res.getHeader("cache-control")).toBe("private, no-store");
    } finally {
      await db.cleanup();
    }
  });

  test("serves goalie combined snapshots from local snapshot storage", async () => {
    const db = await createIntegrationDb();

    try {
      const snapshotPayload = [
        {
          id: "g-snapshot",
          name: "Snapshot Goalie",
          games: 66,
          wins: 40,
          saves: 1800,
          shutouts: 6,
          goals: 0,
          assists: 2,
          points: 2,
          penalties: 3,
          ppp: 0,
          shp: 0,
          score: 100,
          scoreAdjustedByGames: 100,
          seasons: [],
        },
      ];
      await writeSnapshot(
        db.snapshotDir,
        "goalies/combined/regular/team-1",
        snapshotPayload,
      );

      const req = createRequest({
        method: "GET",
        url: "/goalies/combined/regular",
        params: { reportType: "regular" },
      });
      const res = createResponse();

      await getGoaliesCombined(asRouteReq(req), res);

      expect(res.statusCode).toBe(HTTP_STATUS.OK);
      expect(res.getHeader("x-stats-data-source")).toBe("snapshot");
      expect(getJsonBody(res)).toEqual(snapshotPayload);
    } finally {
      await db.cleanup();
    }
  });

  test("uses goalie combined snapshots when startFrom matches the team window", async () => {
    const db = await createIntegrationDb();

    try {
      const snapshotPayload = [
        {
          id: "g-window",
          name: "Window Goalie",
          games: 44,
          wins: 27,
          saves: 1200,
          shutouts: 4,
          goals: 0,
          assists: 1,
          points: 1,
          penalties: 1,
          ppp: 0,
          shp: 0,
          score: 100,
          scoreAdjustedByGames: 100,
          seasons: [],
        },
      ];
      await writeSnapshot(
        db.snapshotDir,
        "goalies/combined/regular/team-28",
        snapshotPayload,
      );

      const req = createRequest({
        method: "GET",
        url: "/goalies/combined/regular?teamId=28&startFrom=2021",
        params: { reportType: "regular" },
        headers: { host: "localhost" },
      });
      const res = createResponse();

      await getGoaliesCombined(asRouteReq(req), res);

      expect(res.statusCode).toBe(HTTP_STATUS.OK);
      expect(res.getHeader("x-stats-data-source")).toBe("snapshot");
      expect(getJsonBody(res)).toEqual(snapshotPayload);
    } finally {
      await db.cleanup();
    }
  });

  test("returns career player aggregates from real player rows", async () => {
    const db = await createIntegrationDb();

    try {
      await db.insertPlayers([
        {
          teamId: "1",
          season: 2024,
          reportType: "regular",
          playerId: "p-career",
          name: "Career Skater",
          position: "F",
          games: 10,
          goals: 4,
          assists: 6,
          points: 10,
          plusMinus: 3,
          shots: 25,
        },
        {
          teamId: "1",
          season: 2024,
          reportType: "playoffs",
          playerId: "p-career",
          name: "Career Skater",
          position: "F",
          games: 2,
          goals: 1,
          assists: 1,
          points: 2,
          shots: 6,
        },
        {
          teamId: "19",
          season: 2023,
          reportType: "regular",
          playerId: "p-career",
          name: "Career Skater",
          position: "F",
          games: 5,
          goals: 2,
          assists: 3,
          points: 5,
          plusMinus: 1,
          shots: 11,
        },
      ]);

      const req = createRequest({
        method: "GET",
        url: "/career/player/p-career",
        params: { id: "p-career" },
      });
      const res = createResponse();

      await getCareerPlayer(asRouteReq(req), res);

      const body = getJsonBody<Record<string, unknown>>(res);
      expect(res.statusCode).toBe(HTTP_STATUS.OK);
      expect(body).toEqual(
        expect.objectContaining({
          id: "p-career",
          name: "Career Skater",
          position: "F",
        }),
      );

      const summary = body.summary as Record<string, unknown>;
      expect(summary.firstSeason).toBe(2023);
      expect(summary.lastSeason).toBe(2024);
      expect(summary.seasonCount).toEqual({ owned: 2, played: 2 });
      expect(summary.teamCount).toEqual({ owned: 2, played: 2 });

      const totals = body.totals as Record<string, Record<string, unknown>>;
      expect(totals.career.games).toBe(17);
      expect(totals.career.points).toBe(17);
      expect(totals.regular.games).toBe(15);
      expect(totals.playoffs.games).toBe(2);

      const seasons = body.seasons as Array<Record<string, unknown>>;
      expect(seasons).toHaveLength(3);
      expect(seasons.map((season) => `${season.season}-${season.teamId}-${season.reportType}`)).toEqual([
        "2024-1-regular",
        "2024-1-playoffs",
        "2023-19-regular",
      ]);
    } finally {
      await db.cleanup();
    }
  });

  test("returns 404 for a missing career player from the live DB", async () => {
    const db = await createIntegrationDb();

    try {
      const req = createRequest({
        method: "GET",
        url: "/career/player/missing",
        params: { id: "missing" },
      });
      const res = createResponse();

      await getCareerPlayer(asRouteReq(req), res);

      expect(res.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
      expect(res._getData()).toBe("Player not found");
      expect(res.getHeader("cache-control")).toBe("private, no-store");
    } finally {
      await db.cleanup();
    }
  });

  test("returns career player list data from the live DB", async () => {
    const db = await createIntegrationDb();

    try {
      await db.insertPlayers([
        {
          teamId: "1",
          season: 2024,
          reportType: "regular",
          playerId: "p-list",
          name: "List Skater",
          position: "F",
          games: 10,
          goals: 4,
          assists: 6,
          points: 10,
        },
        {
          teamId: "1",
          season: 2024,
          reportType: "playoffs",
          playerId: "p-list",
          name: "List Skater",
          position: "F",
          games: 2,
          goals: 1,
          assists: 1,
          points: 2,
        },
      ]);

      const req = createRequest({
        method: "GET",
        url: "/career/players",
      });
      const res = createResponse();

      await getCareerPlayers(asRouteReq(req), res);

      const body = getJsonBody<Array<Record<string, unknown>>>(res);
      expect(res.statusCode).toBe(HTTP_STATUS.OK);
      expect(res.getHeader("x-stats-data-source")).toBe("db");
      expect(body).toEqual([
        {
          id: "p-list",
          name: "List Skater",
          position: "F",
          firstSeason: 2024,
          lastSeason: 2024,
          seasonsOwned: 1,
          seasonsPlayedRegular: 1,
          seasonsPlayedPlayoffs: 1,
          teamsOwned: 1,
          teamsPlayedRegular: 1,
          teamsPlayedPlayoffs: 1,
          regularGames: 10,
          playoffGames: 2,
        },
      ]);
    } finally {
      await db.cleanup();
    }
  });

  test("serves career player list snapshots from local snapshot storage", async () => {
    const db = await createIntegrationDb();

    try {
      const snapshotPayload = [
        {
          id: "p-list-snapshot",
          name: "Snapshot List Skater",
          position: "D",
          firstSeason: 2020,
          lastSeason: 2024,
          seasonsOwned: 5,
          seasonsPlayedRegular: 4,
          seasonsPlayedPlayoffs: 2,
          teamsOwned: 2,
          teamsPlayedRegular: 2,
          teamsPlayedPlayoffs: 1,
          regularGames: 250,
          playoffGames: 20,
        },
      ];
      await writeSnapshot(db.snapshotDir, "career/players", snapshotPayload);

      const req = createRequest({
        method: "GET",
        url: "/career/players",
      });
      const res = createResponse();

      await getCareerPlayers(asRouteReq(req), res);

      expect(res.statusCode).toBe(HTTP_STATUS.OK);
      expect(res.getHeader("x-stats-data-source")).toBe("snapshot");
      expect(getJsonBody(res)).toEqual(snapshotPayload);
    } finally {
      await db.cleanup();
    }
  });

  test("builds playoff leaderboard rows from the live playoff_results table", async () => {
    const db = await createIntegrationDb();

    try {
      await db.insertPlayoffResults([
        { teamId: "1", season: 2024, round: 5 },
        { teamId: "19", season: 2024, round: 4 },
      ]);

      const req = createRequest({
        method: "GET",
        url: "/leaderboard/playoffs",
      });
      const res = createResponse();

      await getPlayoffsLeaderboard(asRouteReq(req), res);

      const body = getJsonBody<Array<Record<string, unknown>>>(res);
      expect(res.statusCode).toBe(HTTP_STATUS.OK);
      expect(res.getHeader("x-stats-data-source")).toBe("db");
      expect(body[0]).toEqual(
        expect.objectContaining({
          teamId: "1",
          teamName: "Colorado Avalanche",
          championships: 1,
          finals: 0,
          conferenceFinals: 0,
          secondRound: 0,
          firstRound: 0,
          appearances: 1,
          tieRank: false,
        }),
      );
      expect((body[0].seasons as Array<Record<string, unknown>>).at(-1)).toEqual({
        season: 2024,
        round: 5,
        key: "championship",
      });
    } finally {
      await db.cleanup();
    }
  });

  test("returns playoff leaderboard zero-state from the live DB when no results exist", async () => {
    const db = await createIntegrationDb();

    try {
      const req = createRequest({
        method: "GET",
        url: "/leaderboard/playoffs",
      });
      const res = createResponse();

      await getPlayoffsLeaderboard(asRouteReq(req), res);

      const body = getJsonBody<Array<Record<string, unknown>>>(res);
      const colorado = body.find((entry) => entry.teamId === "1");

      expect(res.statusCode).toBe(HTTP_STATUS.OK);
      expect(res.getHeader("x-stats-data-source")).toBe("db");
      expect(colorado).toEqual(
        expect.objectContaining({
          teamId: "1",
          teamName: "Colorado Avalanche",
          appearances: 0,
          championships: 0,
          finals: 0,
          conferenceFinals: 0,
          secondRound: 0,
          firstRound: 0,
          tieRank: false,
        }),
      );
    } finally {
      await db.cleanup();
    }
  });

  test("returns career goalie aggregates from real goalie rows", async () => {
    const db = await createIntegrationDb();

    try {
      await db.insertGoalies([
        {
          teamId: "1",
          season: 2024,
          reportType: "regular",
          goalieId: "g-career",
          name: "Career Goalie",
          games: 12,
          wins: 8,
          saves: 340,
          shutouts: 2,
          assists: 1,
          points: 1,
          gaa: 2.15,
          savePercent: 0.918,
        },
        {
          teamId: "19",
          season: 2023,
          reportType: "playoffs",
          goalieId: "g-career",
          name: "Career Goalie",
          games: 4,
          wins: 2,
          saves: 110,
          shutouts: 1,
          gaa: 2.05,
          savePercent: 0.925,
        },
      ]);

      const req = createRequest({
        method: "GET",
        url: "/career/goalie/g-career",
        params: { id: "g-career" },
      });
      const res = createResponse();

      await getCareerGoalie(asRouteReq(req), res);

      const body = getJsonBody<Record<string, unknown>>(res);
      expect(res.statusCode).toBe(HTTP_STATUS.OK);
      expect(body).toEqual(
        expect.objectContaining({
          id: "g-career",
          name: "Career Goalie",
        }),
      );
      const totals = body.totals as Record<string, Record<string, unknown>>;
      expect(totals.career.games).toBe(16);
      expect(totals.career.wins).toBe(10);
      expect(totals.regular.games).toBe(12);
      expect(totals.playoffs.games).toBe(4);
    } finally {
      await db.cleanup();
    }
  });

  test("returns 404 for a missing career goalie from the live DB", async () => {
    const db = await createIntegrationDb();

    try {
      const req = createRequest({
        method: "GET",
        url: "/career/goalie/missing",
        params: { id: "missing" },
      });
      const res = createResponse();

      await getCareerGoalie(asRouteReq(req), res);

      expect(res.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
      expect(res._getData()).toBe("Goalie not found");
      expect(res.getHeader("cache-control")).toBe("private, no-store");
    } finally {
      await db.cleanup();
    }
  });

  test("returns career goalie list data from the live DB", async () => {
    const db = await createIntegrationDb();

    try {
      await db.insertGoalies([
        {
          teamId: "1",
          season: 2024,
          reportType: "regular",
          goalieId: "g-list",
          name: "List Goalie",
          games: 10,
          wins: 7,
          saves: 280,
          shutouts: 2,
        },
        {
          teamId: "1",
          season: 2024,
          reportType: "playoffs",
          goalieId: "g-list",
          name: "List Goalie",
          games: 3,
          wins: 1,
          saves: 75,
          shutouts: 0,
        },
      ]);

      const req = createRequest({
        method: "GET",
        url: "/career/goalies",
      });
      const res = createResponse();

      await getCareerGoalies(asRouteReq(req), res);

      const body = getJsonBody<Array<Record<string, unknown>>>(res);
      expect(res.statusCode).toBe(HTTP_STATUS.OK);
      expect(res.getHeader("x-stats-data-source")).toBe("db");
      expect(body).toEqual([
        {
          id: "g-list",
          name: "List Goalie",
          firstSeason: 2024,
          lastSeason: 2024,
          seasonsOwned: 1,
          seasonsPlayedRegular: 1,
          seasonsPlayedPlayoffs: 1,
          teamsOwned: 1,
          teamsPlayedRegular: 1,
          teamsPlayedPlayoffs: 1,
          regularGames: 10,
          playoffGames: 3,
        },
      ]);
    } finally {
      await db.cleanup();
    }
  });

  test("serves career goalie list snapshots from local snapshot storage", async () => {
    const db = await createIntegrationDb();

    try {
      const snapshotPayload = [
        {
          id: "g-list-snapshot",
          name: "Snapshot List Goalie",
          firstSeason: 2021,
          lastSeason: 2025,
          seasonsOwned: 5,
          seasonsPlayedRegular: 4,
          seasonsPlayedPlayoffs: 2,
          teamsOwned: 2,
          teamsPlayedRegular: 2,
          teamsPlayedPlayoffs: 1,
          regularGames: 210,
          playoffGames: 18,
        },
      ];
      await writeSnapshot(db.snapshotDir, "career/goalies", snapshotPayload);

      const req = createRequest({
        method: "GET",
        url: "/career/goalies",
      });
      const res = createResponse();

      await getCareerGoalies(asRouteReq(req), res);

      expect(res.statusCode).toBe(HTTP_STATUS.OK);
      expect(res.getHeader("x-stats-data-source")).toBe("snapshot");
      expect(getJsonBody(res)).toEqual(snapshotPayload);
    } finally {
      await db.cleanup();
    }
  });

  test("serves playoff leaderboard snapshots from local snapshot storage", async () => {
    const db = await createIntegrationDb();

    try {
      const snapshotPayload = [
        {
          teamId: "2",
          teamName: "Carolina Hurricanes",
          appearances: 4,
          championships: 1,
          finals: 1,
          conferenceFinals: 0,
          secondRound: 1,
          firstRound: 1,
          seasons: [{ season: 2025, round: 5, key: "championship" }],
          tieRank: false,
        },
      ];
      await writeSnapshot(
        db.snapshotDir,
        "leaderboard/playoffs",
        snapshotPayload,
      );

      const req = createRequest({
        method: "GET",
        url: "/leaderboard/playoffs",
      });
      const res = createResponse();

      await getPlayoffsLeaderboard(asRouteReq(req), res);

      expect(res.statusCode).toBe(HTTP_STATUS.OK);
      expect(res.getHeader("x-stats-data-source")).toBe("snapshot");
      expect(getJsonBody(res)).toEqual(snapshotPayload);
    } finally {
      await db.cleanup();
    }
  });

  test("builds regular leaderboard rows from the live regular_results tables", async () => {
    const db = await createIntegrationDb();

    try {
      await db.insertRegularResults([
        {
          teamId: "1",
          season: 2024,
          wins: 10,
          losses: 5,
          ties: 1,
          points: 21,
          divWins: 4,
          divLosses: 2,
          divTies: 0,
          isRegularChampion: true,
        },
        {
          teamId: "19",
          season: 2024,
          wins: 8,
          losses: 7,
          ties: 1,
          points: 17,
          divWins: 3,
          divLosses: 3,
          divTies: 0,
        },
      ]);

      const req = createRequest({
        method: "GET",
        url: "/leaderboard/regular",
      });
      const res = createResponse();

      await getRegularLeaderboard(asRouteReq(req), res);

      const body = getJsonBody<Array<Record<string, unknown>>>(res);
      expect(res.statusCode).toBe(HTTP_STATUS.OK);
      expect(res.getHeader("x-stats-data-source")).toBe("db");
      expect(body).toHaveLength(2);
      expect(body[0]).toEqual(
        expect.objectContaining({
          teamId: "1",
          teamName: "Colorado Avalanche",
          wins: 10,
          losses: 5,
          ties: 1,
          points: 21,
          regularTrophies: 1,
          winPercent: 0.625,
          divWinPercent: 0.667,
          pointsPercent: 0.656,
          tieRank: false,
        }),
      );
      expect(body[0].seasons).toEqual([
        {
          season: 2024,
          regularTrophy: true,
          wins: 10,
          losses: 5,
          ties: 1,
          points: 21,
          divWins: 4,
          divLosses: 2,
          divTies: 0,
          winPercent: 0.625,
          divWinPercent: 0.667,
          pointsPercent: 0.656,
        },
      ]);
    } finally {
      await db.cleanup();
    }
  });

  test("returns an empty regular leaderboard from the live DB when no results exist", async () => {
    const db = await createIntegrationDb();

    try {
      const req = createRequest({
        method: "GET",
        url: "/leaderboard/regular",
      });
      const res = createResponse();

      await getRegularLeaderboard(asRouteReq(req), res);

      expect(res.statusCode).toBe(HTTP_STATUS.OK);
      expect(res.getHeader("x-stats-data-source")).toBe("db");
      expect(getJsonBody(res)).toEqual([]);
    } finally {
      await db.cleanup();
    }
  });

  test("falls back to live regular leaderboard data when the snapshot file is malformed", async () => {
    const db = await createIntegrationDb();

    try {
      await db.insertRegularResults([
        {
          teamId: "1",
          season: 2024,
          wins: 10,
          losses: 5,
          ties: 1,
          points: 21,
          divWins: 4,
          divLosses: 2,
          divTies: 0,
          isRegularChampion: true,
        },
      ]);

      const malformedSnapshotPath = path.join(
        db.snapshotDir,
        "leaderboard",
        "regular.json",
      );
      await fs.mkdir(path.dirname(malformedSnapshotPath), { recursive: true });
      await fs.writeFile(malformedSnapshotPath, "{ invalid json", "utf8");

      const req = createRequest({
        method: "GET",
        url: "/leaderboard/regular",
      });
      const res = createResponse();

      await getRegularLeaderboard(asRouteReq(req), res);

      const body = getJsonBody<Array<Record<string, unknown>>>(res);
      expect(res.statusCode).toBe(HTTP_STATUS.OK);
      expect(res.getHeader("x-stats-data-source")).toBe("db");
      expect(body).toEqual([
        expect.objectContaining({
          teamId: "1",
          teamName: "Colorado Avalanche",
          wins: 10,
          losses: 5,
          ties: 1,
          points: 21,
          regularTrophies: 1,
        }),
      ]);
    } finally {
      await db.cleanup();
    }
  });

  test("serves cached last-modified responses with a real ETag/304 flow", async () => {
    const db = await createIntegrationDb();

    try {
      await db.setLastModified("2026-03-10T12:00:00.000Z");

      const firstReq = createRequest({
        method: "GET",
        url: "/last-modified",
      });
      const firstRes = createResponse();

      await getLastModified(asRouteReq(firstReq), firstRes);

      const firstBody = getJsonBody<Record<string, string | null>>(firstRes);
      const etag = String(firstRes.getHeader("etag"));

      expect(firstRes.statusCode).toBe(HTTP_STATUS.OK);
      expect(firstBody).toEqual({ lastModified: "2026-03-10T12:00:00.000Z" });
      expect(firstRes.getHeader("x-stats-data-source")).toBe("db");
      expect(etag).toMatch(/^".+"$/);

      const secondReq = createRequest({
        method: "GET",
        url: "/last-modified",
        headers: { "if-none-match": etag },
      });
      const secondRes = createResponse();

      await getLastModified(asRouteReq(secondReq), secondRes);

      expect(secondRes.statusCode).toBe(304);
      expect(secondRes._getData()).toBe("");
    } finally {
      await db.cleanup();
    }
  });

  test("returns null last-modified from the live DB when metadata is missing", async () => {
    const db = await createIntegrationDb();

    try {
      const req = createRequest({
        method: "GET",
        url: "/last-modified",
      });
      const res = createResponse();

      await getLastModified(asRouteReq(req), res);

      expect(res.statusCode).toBe(HTTP_STATUS.OK);
      expect(res.getHeader("x-stats-data-source")).toBe("db");
      expect(getJsonBody(res)).toEqual({ lastModified: null });
    } finally {
      await db.cleanup();
    }
  });
});
