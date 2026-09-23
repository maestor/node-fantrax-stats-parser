import { createRequest, createResponse } from "node-mocks-http";
import { CURRENT_SEASON, TEAMS } from "../config/index.js";
import { getCategoryDashboard } from "../features/team-categories/routes.js";
import { HTTP_STATUS } from "../shared/http.js";
import { createIntegrationDb } from "./integration-db.js";
import { expectObjectSchema } from "./openapi-schema.js";
import { asRouteReq, getJsonBody } from "./routes.integration.helpers.js";

type RouteReq = Parameters<typeof getCategoryDashboard>[0];
type TestCategoryValue = {
  total: number;
  games: number;
  rate: number | null;
  totalRank: number | null;
  rateRank: number | null;
  totalEligibleTeamCount: number;
  rateEligibleTeamCount: number;
  totalMedian: number | null;
  rateMedian: number | null;
  totalGapToNext: number | null;
  rateGapToNext: number | null;
  previous: { total: number; totalRank: number | null; totalRankChange: number | null } | null;
};
type TestTeam = {
  teamId: string;
  goalieGames: number;
  participation: string;
  categories: Record<string, TestCategoryValue>;
  players: Array<{ id: string; goals: number }>;
};
type TestDashboard = {
  season: number;
  scope: string;
  lastModified: string | null;
  seasonHasCreditedGames: boolean;
  coverage: { status: string; missingReportTeamIds: string[] };
  availableSeasons: number[];
  teams: TestTeam[];
};

const regularResult = (teamId: string, season: number) => ({
  teamId, season, wins: 0, losses: 0, ties: 0, points: 0,
  divWins: 0, divLosses: 0, divTies: 0,
});

export const registerCategoryDashboardRouteIntegrationTests = (): void => {
describe("category dashboard route", () => {
  test("ranks regular production by totals and credited-game rates and includes contributors", async () => {
    const db = await createIntegrationDb();
    try {
      await db.insertRegularResults([
        regularResult("1", 2023), regularResult("2", 2023),
        regularResult("1", 2024), regularResult("2", 2024), regularResult("3", 2024),
      ]);
      await db.insertPlayers([
        { teamId: "1", season: 2023, reportType: "regular", playerId: "a-old", name: "A prior", games: 10, goals: 30 },
        { teamId: "2", season: 2023, reportType: "regular", playerId: "b-old", name: "B prior", games: 10, goals: 10 },
        { teamId: "1", season: 2024, reportType: "regular", playerId: "a-1", name: "A One", position: "F", games: 8, goals: 4 },
        { teamId: "1", season: 2024, reportType: "regular", playerId: "a-2", name: "A Two", position: "D", games: 12, goals: 6, plusMinus: -3 },
        { teamId: "2", season: 2024, reportType: "regular", playerId: "b-1", name: "B One", position: "F", games: 40, goals: 12 },
        { teamId: "1", season: 2024, reportType: "playoffs", playerId: "a-playoff", name: "Playoff only", games: 50, goals: 999 },
      ]);
      await db.insertGoalies([
        { teamId: "1", season: 2024, reportType: "regular", goalieId: "g1", name: "Goalie One", games: 100, wins: 50, saves: 900, shutouts: 5 },
        { teamId: "2", season: 2024, reportType: "regular", goalieId: "g2", name: "Goalie Two", games: 1, wins: 1, saves: 20, shutouts: 0 },
      ]);
      await db.setLastModified("2026-09-20T12:00:00.000Z");

      const req = createRequest({ method: "GET", url: "/leaderboard/categories?season=2024" });
      const res = createResponse();
      await getCategoryDashboard(asRouteReq<RouteReq>(req), res);

      const body = getJsonBody<TestDashboard>(res);
      expect(res.statusCode).toBe(HTTP_STATUS.OK);
      expect(res.getHeader("x-stats-data-source")).toBe("db");
      expect(body.season).toBe(2024);
      expect(body.scope).toBe("regular");
      expect(body.lastModified).toBe("2026-09-20T12:00:00.000Z");
      expect(body.seasonHasCreditedGames).toBe(true);
      expect(body.coverage.status).toBe("partial");
      expect(body.coverage.missingReportTeamIds).toContain("3");
      expect(body.availableSeasons).toEqual([2024, 2023]);

      const a = body.teams.find((team) => team.teamId === "1")!;
      const b = body.teams.find((team) => team.teamId === "2")!;
      expect(a.categories.goals).toEqual(expect.objectContaining({
        total: 10, games: 20, rate: 0.5,
        totalRank: 2, rateRank: 1,
        totalEligibleTeamCount: 2, rateEligibleTeamCount: 2,
        totalMedian: 11, rateMedian: 0.4,
        totalGapToNext: 2, rateGapToNext: null,
        previous: expect.objectContaining({ total: 30, totalRank: 1, totalRankChange: -1 }),
      }));
      expect(b.categories.goals).toEqual(expect.objectContaining({ total: 12, games: 40, rate: 0.3, totalRank: 1, rateRank: 2 }));
      expect(a.goalieGames).toBe(100);
      expect(b.goalieGames).toBe(1);
      expect(a.players.map((player) => player.id)).toEqual(["a-1", "a-2"]);
      expect(a.players.reduce((sum, player) => sum + player.goals, 0)).toBe(a.categories.goals.total);
      expect(a.categories.wins.games).toBe(100);
      expect(b.categories.goals.games).toBe(40);
      const noReport = body.teams.find((team) => team.teamId === "3")!;
      expect(noReport.participation).toBe("missing-report");
      expect(noReport.categories.goals.rate).toBeNull();
      expect(noReport.categories.goals.rateRank).toBeNull();
      expectObjectSchema("CategoryDashboardResponse", body);
    } finally {
      await db.cleanup();
    }
  });

  test("rejects malformed and unavailable seasons", async () => {
    const db = await createIntegrationDb();
    try {
      await db.insertPlayers([{ teamId: "1", season: 2024, reportType: "regular", playerId: "p", name: "Player", games: 1 }]);
      for (const url of ["/leaderboard/categories?season=20xx", "/leaderboard/categories?season=2023"]) {
        const req = createRequest({ method: "GET", url });
        const res = createResponse();
        await getCategoryDashboard(asRouteReq<RouteReq>(req), res);
        expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
      }
    } finally {
      await db.cleanup();
    }
  });

  test("defaults an omitted season to the previous season", async () => {
    const db = await createIntegrationDb();
    try {
      await db.insertPlayers([
        { teamId: "1", season: 2024, reportType: "regular", playerId: "prior", name: "Prior season", games: 1 },
      ]);

      const req = createRequest({ method: "GET", url: "/leaderboard/categories" });
      const res = createResponse();
      await getCategoryDashboard(asRouteReq<RouteReq>(req), res);

      const body = getJsonBody<TestDashboard>(res);
      expect(res.statusCode).toBe(HTTP_STATUS.OK);
      expect(body.season).toBe(CURRENT_SEASON - 1);
      expectObjectSchema("CategoryDashboardResponse", body);
    } finally {
      await db.cleanup();
    }
  });

  test("keeps zero-game imports selectable but outside category ranks", async () => {
    const db = await createIntegrationDb();
    try {
      await db.insertPlayers([
        { teamId: "1", season: 2024, reportType: "regular", playerId: "zero", name: "No games", games: 0 },
      ]);
      const req = createRequest({ method: "GET", url: "/leaderboard/categories?season=2024" });
      const res = createResponse();
      await getCategoryDashboard(asRouteReq<RouteReq>(req), res);
      const body = getJsonBody<TestDashboard>(res);
      const team = body.teams.find((entry) => entry.teamId === "1")!;
      expect(body.availableSeasons).toContain(2024);
      expect(body.seasonHasCreditedGames).toBe(false);
      expect(team.categories.goals).toEqual(expect.objectContaining({
        total: 0, games: 0, rate: null, totalRank: null, rateRank: null,
        totalEligibleTeamCount: 0, rateEligibleTeamCount: 0,
      }));
    } finally {
      await db.cleanup();
    }
  });

  test("uses the previous season when the request URL is absent and ranks a single eligible team", async () => {
    const db = await createIntegrationDb();
    try {
      await db.insertPlayers([
        { teamId: "1", season: CURRENT_SEASON - 1, reportType: "regular", playerId: "p", name: "Player", games: 1, goals: 9 },
      ]);
      const req = createRequest({ method: "GET" });
      Object.defineProperty(req, "url", { value: undefined, configurable: true });
      const res = createResponse();
      await getCategoryDashboard(asRouteReq<RouteReq>(req), res);

      const body = getJsonBody<TestDashboard>(res);
      expect(res.statusCode).toBe(HTTP_STATUS.OK);
      expect(body.season).toBe(CURRENT_SEASON - 1);
      expect(body.teams.find((team) => team.teamId === "1")?.categories.goals.totalMedian).toBe(9);
    } finally {
      await db.cleanup();
    }
  });

  test("returns complete coverage when every expected team has a regular report", async () => {
    const db = await createIntegrationDb();
    try {
      const expectedTeams = TEAMS.filter((team) => (team.firstSeason ?? 2012) <= 2024);
      await db.insertRegularResults(expectedTeams.map((team) => regularResult(team.id, 2024)));
      await db.insertPlayers(expectedTeams.map((team, index) => ({
        teamId: team.id,
        season: 2024,
        reportType: "regular" as const,
        playerId: `p-${index}`,
        name: `Player ${index}`,
        games: 1,
        goals: index,
      })));

      const req = createRequest({ method: "GET", url: "/leaderboard/categories?season=2024" });
      const res = createResponse();
      await getCategoryDashboard(asRouteReq<RouteReq>(req), res);

      const body = getJsonBody<TestDashboard>(res);
      expect(body.coverage.status).toBe("complete");
      expect(body.coverage.missingReportTeamIds).toEqual([]);
    } finally {
      await db.cleanup();
    }
  });

  test("handles teams with no category games in either current or previous season", async () => {
    const db = await createIntegrationDb();
    try {
      await db.insertPlayers([
        { teamId: "1", season: 2023, reportType: "regular", playerId: "a-old", name: "A prior", games: 0, goals: 1 },
        { teamId: "1", season: 2024, reportType: "regular", playerId: "a-current", name: "A current", games: 5, goals: 8 },
        { teamId: "2", season: 2023, reportType: "regular", playerId: "b-old", name: "B prior", games: 5, goals: 4 },
        { teamId: "2", season: 2024, reportType: "regular", playerId: "b-current", name: "B current", games: 0, goals: 0 },
      ]);

      const req = createRequest({ method: "GET", url: "/leaderboard/categories?season=2024" });
      const res = createResponse();
      await getCategoryDashboard(asRouteReq<RouteReq>(req), res);

      const body = getJsonBody<TestDashboard>(res);
      const a = body.teams.find((team) => team.teamId === "1")!;
      const b = body.teams.find((team) => team.teamId === "2")!;
      expect(a.categories.goals.previous).toEqual(expect.objectContaining({
        total: 1, totalRank: null, totalRankChange: null,
      }));
      expect(b.categories.goals.previous).toEqual(expect.objectContaining({
        total: 4, totalRank: 1, totalRankChange: null,
      }));
    } finally {
      await db.cleanup();
    }
  });

  test("marks franchises that joined after the selected season as not yet joined", async () => {
    const db = await createIntegrationDb();
    try {
      await db.insertPlayers([
        { teamId: "1", season: 2012, reportType: "regular", playerId: "p", name: "Player", games: 1, goals: 1 },
      ]);
      const req = createRequest({ method: "GET", url: "/leaderboard/categories?season=2012" });
      const res = createResponse();
      await getCategoryDashboard(asRouteReq<RouteReq>(req), res);

      const body = getJsonBody<TestDashboard>(res);
      expect(body.teams.find((team) => team.teamId === "28")?.participation).toBe("not-yet-joined");
      expect(body.teams.find((team) => team.teamId === "32")?.participation).toBe("not-yet-joined");
    } finally {
      await db.cleanup();
    }
  });

  test("reports unknown coverage when imported rows belong only to an unrecognized team", async () => {
    const db = await createIntegrationDb();
    try {
      await db.insertPlayers([
        { teamId: "999", season: 2024, reportType: "regular", playerId: "legacy", name: "Legacy team player", games: 1, goals: 1 },
      ]);
      const req = createRequest({ method: "GET", url: "/leaderboard/categories?season=2024" });
      const res = createResponse();
      await getCategoryDashboard(asRouteReq<RouteReq>(req), res);

      const body = getJsonBody<TestDashboard>(res);
      expect(body.coverage.status).toBe("unknown");
      expect(body.coverage.missingReportTeamIds).toEqual([]);
    } finally {
      await db.cleanup();
    }
  });
});
};
