import { createRequest, createResponse } from "node-mocks-http";
import {
  getCareerPlayer,
  getGoaliesCombined,
  getLastModified,
  getPlayersSeason,
  getRegularLeaderboard,
} from "../routes";
import { ERROR_MESSAGES, HTTP_STATUS } from "../constants";
import { createIntegrationDb } from "./integration-db";

type RouteReq = Parameters<typeof getPlayersSeason>[0];
type MockResponse = ReturnType<typeof createResponse>;

const asRouteReq = (req: unknown): RouteReq => req as RouteReq;

const getJsonBody = <T>(res: MockResponse): T => res._getJSONData() as T;

describe("routes integration", () => {
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
});
