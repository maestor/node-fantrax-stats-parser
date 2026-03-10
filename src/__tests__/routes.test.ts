import { send } from "micro";
import { createRequest, createResponse } from "node-mocks-http";
import Ajv from "ajv";
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import {
  getSeasons,
  getTeams,
  getHealthcheck,
  getPlayersSeason,
  getPlayersCombined,
  getGoaliesSeason,
  getGoaliesCombined,
  getCareerPlayer,
  getCareerGoalie,
  getCareerPlayers,
  getCareerGoalies,
  getLastModified,
  getPlayoffsLeaderboard,
  getRegularLeaderboard,
  resetRouteCachesForTests,
} from "../routes";
import {
  getAvailableSeasons,
  getPlayersStatsSeason,
  getPlayersStatsCombined,
  getGoaliesStatsSeason,
  getGoaliesStatsCombined,
  getPlayerCareerData,
  getGoalieCareerData,
  getCareerPlayersData,
  getCareerGoaliesData,
  getPlayoffLeaderboardData,
  getRegularLeaderboardData,
} from "../services";
import {
  reportTypeAvailable,
  seasonAvailable,
  parseSeasonParam,
  resolveTeamId,
  getTeamsWithData,
} from "../helpers";
import { ERROR_MESSAGES, HTTP_STATUS } from "../constants";
import { getLastModifiedFromDb } from "../db/queries";
import { makeEtagForJson } from "../cache";
import { loadSnapshot } from "../snapshots";

jest.mock("micro");
jest.mock("../services");
jest.mock("../helpers");
jest.mock("../db/queries");
jest.mock("../snapshots", () => ({
  loadSnapshot: jest.fn(),
  getCareerGoaliesSnapshotKey: jest.fn(() => "career/goalies"),
  getCareerPlayersSnapshotKey: jest.fn(() => "career/players"),
  getCombinedSnapshotKey: jest.fn(
    (kind: "players" | "goalies", report: string, teamId: string) =>
      `${kind}/combined/${report}/team-${teamId}`,
  ),
  getPlayoffsLeaderboardSnapshotKey: jest.fn(() => "leaderboard/playoffs"),
  getRegularLeaderboardSnapshotKey: jest.fn(() => "leaderboard/regular"),
}));

type RouteReq = Parameters<typeof getSeasons>[0];
const asRouteReq = (req: unknown): RouteReq => req as RouteReq;

describe("routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRouteCachesForTests();
    (loadSnapshot as jest.Mock).mockResolvedValue(null);
    (resolveTeamId as jest.Mock).mockReturnValue("1");
    (reportTypeAvailable as jest.Mock).mockReturnValue(true);
    (seasonAvailable as jest.Mock).mockResolvedValue(true);
    (parseSeasonParam as jest.Mock).mockReturnValue(undefined);
  });

  describe("getHealthcheck", () => {
    test("returns 200 with ok status payload", async () => {
      const req = createRequest();
      const res = createResponse();

      await getHealthcheck(asRouteReq(req), res);

      expect(send).toHaveBeenCalledWith(
        res,
        HTTP_STATUS.OK,
        expect.objectContaining({
          status: "ok",
          uptimeSeconds: expect.any(Number),
          timestamp: expect.any(String),
        }),
      );
    });
  });

  describe("getSeasons", () => {
    test("returns 500 on service error", async () => {
      const error = new Error("DB error");
      (getAvailableSeasons as jest.Mock).mockRejectedValue(error);

      const req = createRequest();
      const res = createResponse();

      await getSeasons(asRouteReq(req), res);

      expect(send).toHaveBeenCalledWith(
        res,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        error,
      );
    });

    test("returns 400 for invalid report type path param", async () => {
      (reportTypeAvailable as jest.Mock).mockReturnValue(false);

      const req = createRequest({
        url: "/seasons/invalid",
        params: { reportType: "invalid" },
      });
      const res = createResponse();

      await getSeasons(asRouteReq(req), res);

      expect(send).toHaveBeenCalledWith(
        res,
        HTTP_STATUS.BAD_REQUEST,
        ERROR_MESSAGES.INVALID_REPORT_TYPE,
      );
    });

    test("handles request with non-string url (defaults query params)", async () => {
      const mockSeasons = [{ season: 2012, text: "2012-2013" }];
      (getAvailableSeasons as jest.Mock).mockResolvedValue(mockSeasons);

      const req = { url: 123, params: {} } as unknown as ReturnType<
        typeof createRequest
      >;
      const res = createResponse();

      await getSeasons(asRouteReq(req), res);

      expect(getAvailableSeasons).toHaveBeenCalledWith(
        "1",
        "regular",
        undefined,
      );
      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, mockSeasons);
    });

    test("parses query params with valid url but no headers object", async () => {
      const mockSeasons = [{ season: 2012, text: "2012-2013" }];
      (getAvailableSeasons as jest.Mock).mockResolvedValue(mockSeasons);
      (resolveTeamId as jest.Mock).mockImplementation((raw: unknown) =>
        typeof raw === "string" && raw ? raw : "1",
      );

      const req = {
        url: "/seasons?teamId=1",
        params: {},
      } as unknown as ReturnType<typeof createRequest>;
      const res = createResponse();

      await getSeasons(asRouteReq(req), res);

      expect(getAvailableSeasons).toHaveBeenCalledWith(
        "1",
        "regular",
        undefined,
      );
      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, mockSeasons);
    });

    test("returns statusCode from typed error", async () => {
      const error = { statusCode: 422, message: "missing" };
      (getAvailableSeasons as jest.Mock).mockRejectedValue(error);

      const req = createRequest();
      const res = createResponse();

      await getSeasons(asRouteReq(req), res);

      expect(send).toHaveBeenCalledWith(res, 422, error);
    });

    test("falls back to 500 when error statusCode is falsy (0)", async () => {
      const error = { statusCode: 0, message: "falsy code" };
      (getAvailableSeasons as jest.Mock).mockRejectedValue(error);

      const req = createRequest();
      const res = createResponse();

      await getSeasons(asRouteReq(req), res);

      expect(send).toHaveBeenCalledWith(
        res,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        error,
      );
    });

  });

  describe("getTeams", () => {
    test("returns 200 with configured teams", async () => {
      const filteredTeams = [{ id: "1", name: "colorado" }];
      (getTeamsWithData as jest.Mock).mockReturnValue(filteredTeams);

      const req = createRequest();
      const res = createResponse();

      await getTeams(asRouteReq(req), res);

      expect(res.getHeader("x-stats-data-source")).toBe("db");
      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, filteredTeams);
    });

    test("memoizes successful responses and avoids re-calling the handler", async () => {
      const filteredTeams = [{ id: "1", name: "colorado" }];
      (getTeamsWithData as jest.Mock).mockReturnValue(filteredTeams);

      const req1 = createRequest({ url: "/teams" });
      const res1 = createResponse();
      await getTeams(asRouteReq(req1), res1);

      (send as jest.Mock).mockClear();
      const req2 = createRequest({ url: "/teams" });
      const res2 = createResponse();
      await getTeams(asRouteReq(req2), res2);

      expect(getTeamsWithData).toHaveBeenCalledTimes(1);
      expect(res2.getHeader("x-stats-data-source")).toBe("db");
      expect(send).toHaveBeenCalledWith(res2, HTTP_STATUS.OK, filteredTeams);
    });

    test("returns 304 for matching If-None-Match", async () => {
      const filteredTeams = [{ id: "1", name: "colorado" }];
      (getTeamsWithData as jest.Mock).mockReturnValue(filteredTeams);

      const req1 = createRequest({ url: "/teams", method: "GET" });
      const res1 = createResponse();
      await getTeams(asRouteReq(req1), res1);

      (send as jest.Mock).mockClear();
      const etag = makeEtagForJson(filteredTeams);
      const req2 = {
        method: "GET",
        url: "/teams",
        headers: { host: "localhost", "if-none-match": etag },
      } as unknown as ReturnType<typeof createRequest>;
      const res2 = createResponse();
      const endSpy = jest.spyOn(res2, "end");
      await getTeams(asRouteReq(req2), res2);

      expect(getTeamsWithData).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledTimes(0);
      expect(res2.getHeader("x-stats-data-source")).toBe("db");
      expect(res2.statusCode).toBe(304);
      expect(endSpy).toHaveBeenCalled();
    });

    test("hits cached 304 branch on repeat request", async () => {
      const filteredTeams = [{ id: "1", name: "colorado" }];
      (getTeamsWithData as jest.Mock).mockReturnValue(filteredTeams);

      const primeReq = {
        method: "GET",
        url: "/teams",
        headers: { host: "localhost" },
      } as unknown as ReturnType<typeof createRequest>;
      const primeRes = createResponse();
      await getTeams(asRouteReq(primeReq), primeRes);

      (send as jest.Mock).mockClear();

      const etag = makeEtagForJson(filteredTeams);
      const cachedReq = {
        method: "GET",
        url: "/teams",
        headers: { host: "localhost", "if-none-match": etag },
      } as unknown as ReturnType<typeof createRequest>;
      const cachedRes = createResponse();
      const endSpy = jest.spyOn(cachedRes, "end");

      await getTeams(asRouteReq(cachedReq), cachedRes);

      expect(getTeamsWithData).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledTimes(0);
      expect(cachedRes.statusCode).toBe(304);
      expect(endSpy).toHaveBeenCalled();
    });

    test("returns 304 on first request when If-None-Match matches freshly computed etag", async () => {
      const filteredTeams = [{ id: "1", name: "colorado" }];
      (getTeamsWithData as jest.Mock).mockReturnValue(filteredTeams);

      const etag = makeEtagForJson(filteredTeams);
      const req = {
        method: "GET",
        url: "/teams",
        headers: { host: "localhost", "if-none-match": etag },
      } as unknown as ReturnType<typeof createRequest>;
      const res = createResponse();
      const endSpy = jest.spyOn(res, "end");

      await getTeams(asRouteReq(req), res);

      expect(getTeamsWithData).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledTimes(0);
      expect(res.statusCode).toBe(304);
      expect(endSpy).toHaveBeenCalled();
    });

    test("works when req is undefined (no caching possible)", async () => {
      const filteredTeams = [{ id: "1", name: "colorado" }];
      (getTeamsWithData as jest.Mock).mockReturnValue(filteredTeams);

      const res = createResponse();
      await getTeams(undefined as unknown as RouteReq, res);

      expect(getTeamsWithData).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, filteredTeams);
    });
  });

  describe("getPlayersSeason", () => {
    test("returns 400 for invalid report type", async () => {
      (reportTypeAvailable as jest.Mock).mockReturnValue(false);
      (seasonAvailable as jest.Mock).mockResolvedValue(true);

      const req = createRequest({
        params: { reportType: "invalid" },
      });
      const res = createResponse();

      await getPlayersSeason(asRouteReq(req), res);

      expect(send).toHaveBeenCalledWith(
        res,
        HTTP_STATUS.BAD_REQUEST,
        ERROR_MESSAGES.INVALID_REPORT_TYPE,
      );
    });

    test("returns 500 on service error", async () => {
      const error = new Error("Service error");
      (reportTypeAvailable as jest.Mock).mockReturnValue(true);
      (seasonAvailable as jest.Mock).mockResolvedValue(true);
      (getPlayersStatsSeason as jest.Mock).mockRejectedValue(error);

      const req = createRequest({
        params: { reportType: "regular", season: "2024" },
      });
      const res = createResponse();

      await getPlayersSeason(asRouteReq(req), res);

      expect(send).toHaveBeenCalledWith(
        res,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        error,
      );
    });
  });

  describe("getPlayersCombined", () => {
    test("returns 400 for invalid report type", async () => {
      (reportTypeAvailable as jest.Mock).mockReturnValue(false);

      const req = createRequest({
        params: { reportType: "invalid" },
      });
      const res = createResponse();

      await getPlayersCombined(asRouteReq(req), res);

      expect(send).toHaveBeenCalledWith(
        res,
        HTTP_STATUS.BAD_REQUEST,
        ERROR_MESSAGES.INVALID_REPORT_TYPE,
      );
    });

    test("returns 500 on service error", async () => {
      const error = new Error("Service error");
      (reportTypeAvailable as jest.Mock).mockReturnValue(true);
      (getPlayersStatsCombined as jest.Mock).mockRejectedValue(error);
      (loadSnapshot as jest.Mock).mockRejectedValue(
        new Error("snapshot unavailable"),
      );

      const req = createRequest({
        params: { reportType: "regular" },
      });
      const res = createResponse();

      await getPlayersCombined(asRouteReq(req), res);

      expect(send).toHaveBeenCalledWith(
        res,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        error,
      );
    });

  });

  describe("getGoaliesSeason", () => {
    test("returns 400 for invalid report type", async () => {
      (reportTypeAvailable as jest.Mock).mockReturnValue(false);
      (seasonAvailable as jest.Mock).mockResolvedValue(true);

      const req = createRequest({
        params: { reportType: "invalid" },
      });
      const res = createResponse();

      await getGoaliesSeason(asRouteReq(req), res);

      expect(send).toHaveBeenCalledWith(
        res,
        HTTP_STATUS.BAD_REQUEST,
        ERROR_MESSAGES.INVALID_REPORT_TYPE,
      );
    });

    test("returns 500 on service error", async () => {
      const error = new Error("Service error");
      (reportTypeAvailable as jest.Mock).mockReturnValue(true);
      (seasonAvailable as jest.Mock).mockResolvedValue(true);
      (getGoaliesStatsSeason as jest.Mock).mockRejectedValue(error);

      const req = createRequest({
        params: { reportType: "regular", season: "2024" },
      });
      const res = createResponse();

      await getGoaliesSeason(asRouteReq(req), res);

      expect(send).toHaveBeenCalledWith(
        res,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        error,
      );
    });
  });

  describe("getGoaliesCombined", () => {
    test("returns 400 for invalid report type", async () => {
      (reportTypeAvailable as jest.Mock).mockReturnValue(false);

      const req = createRequest({
        params: { reportType: "invalid" },
      });
      const res = createResponse();

      await getGoaliesCombined(asRouteReq(req), res);

      expect(send).toHaveBeenCalledWith(
        res,
        HTTP_STATUS.BAD_REQUEST,
        ERROR_MESSAGES.INVALID_REPORT_TYPE,
      );
    });

    test("returns 500 on service error", async () => {
      const error = new Error("Service error");
      (reportTypeAvailable as jest.Mock).mockReturnValue(true);
      (getGoaliesStatsCombined as jest.Mock).mockRejectedValue(error);

      const req = createRequest({
        params: { reportType: "regular" },
      });
      const res = createResponse();

      await getGoaliesCombined(asRouteReq(req), res);

      expect(send).toHaveBeenCalledWith(
        res,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        error,
      );
    });

  });

  describe("getLastModified", () => {
    test("returns 304 on first request when If-None-Match matches freshly computed etag", async () => {
      const mockTimestamp = "2026-01-28T10:00:00.000Z";
      const mockResponse = { lastModified: mockTimestamp };
      (getLastModifiedFromDb as jest.Mock).mockResolvedValue(mockTimestamp);

      const etag = makeEtagForJson(mockResponse);
      const req = {
        method: "GET",
        url: "/last-modified",
        headers: { host: "localhost", "if-none-match": etag },
      } as unknown as ReturnType<typeof createRequest>;
      const res = createResponse();
      const endSpy = jest.spyOn(res, "end");

      await getLastModified(asRouteReq(req), res);

      expect(getLastModifiedFromDb).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledTimes(0);
      expect(res.statusCode).toBe(304);
      expect(endSpy).toHaveBeenCalled();
    });

    test("works when req is undefined (no caching possible)", async () => {
      const mockTimestamp = "2026-01-28T10:00:00.000Z";
      (getLastModifiedFromDb as jest.Mock).mockResolvedValue(mockTimestamp);

      const res = createResponse();
      await getLastModified(undefined as unknown as RouteReq, res);

      expect(getLastModifiedFromDb).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, {
        lastModified: "2026-01-28T10:00:00.000Z",
      });
    });
  });

  describe("getPlayoffsLeaderboard", () => {
    test("handles service error", async () => {
      (getPlayoffLeaderboardData as jest.Mock).mockRejectedValue(
        new Error("DB error"),
      );

      const req = createRequest({
        method: "GET",
        url: "/leaderboard/playoffs",
      });
      const res = createResponse();

      await getPlayoffsLeaderboard(asRouteReq(req), res);

      expect(send).toHaveBeenCalledWith(
        res,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Error),
      );
    });
  });

  describe("getRegularLeaderboard", () => {
    test("handles service error", async () => {
      (getRegularLeaderboardData as jest.Mock).mockRejectedValue(
        new Error("DB error"),
      );

      const req = createRequest({ method: "GET", url: "/leaderboard/regular" });
      const res = createResponse();

      await getRegularLeaderboard(asRouteReq(req), res);

      expect(send).toHaveBeenCalledWith(
        res,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Error),
      );
    });
  });

  describe("spec schema conformance", () => {
    function buildArrayValidator(
      schemaName: string,
    ): ReturnType<Ajv["compile"]> {
      const specPath = path.join(__dirname, "..", "..", "openapi.yaml");
      const raw = fs.readFileSync(specPath, "utf8");
      const spec = yaml.load(raw) as {
        components: { schemas: Record<string, unknown> };
      };
      const defsJson = JSON.stringify(spec.components.schemas).replace(
        /#\/components\/schemas\//g,
        "#/definitions/",
      );
      const definitions = JSON.parse(defsJson) as Record<string, unknown>;
      const ajv = new Ajv({ allErrors: true, strict: false });
      return ajv.compile({
        type: "array",
        items: { $ref: `#/definitions/${schemaName}` },
        definitions,
      });
    }

    function buildObjectValidator(
      schemaName: string,
    ): ReturnType<Ajv["compile"]> {
      const specPath = path.join(__dirname, "..", "..", "openapi.yaml");
      const raw = fs.readFileSync(specPath, "utf8");
      const spec = yaml.load(raw) as {
        components: { schemas: Record<string, unknown> };
      };
      const defsJson = JSON.stringify(spec.components.schemas).replace(
        /#\/components\/schemas\//g,
        "#/definitions/",
      );
      const definitions = JSON.parse(defsJson) as Record<string, unknown>;
      const ajv = new Ajv({ allErrors: true, strict: false });
      return ajv.compile({
        $ref: `#/definitions/${schemaName}`,
        definitions,
      });
    }

    function getCapturedBody(): unknown {
      return (send as jest.Mock).mock.calls[0][2];
    }

    const validSeason = { season: 2023, text: "2023-2024" };

    const validTeam = {
      id: "1",
      name: "colorado",
      presentName: "Colorado Avalanche",
    };

    const validPlayer = {
      id: "p900",
      name: "Test Player",
      position: "F",
      games: 82,
      goals: 30,
      assists: 40,
      points: 70,
      plusMinus: 15,
      penalties: 20,
      shots: 150,
      ppp: 10,
      shp: 2,
      hits: 50,
      blocks: 30,
      score: 85.5,
      scoreAdjustedByGames: 80.0,
    };

    const validGoalie = {
      id: "g900",
      name: "Test Goalie",
      games: 50,
      goals: 0,
      assists: 2,
      points: 2,
      penalties: 4,
      ppp: 0,
      shp: 0,
      wins: 30,
      saves: 1200,
      shutouts: 5,
      score: 90.0,
      scoreAdjustedByGames: 85.0,
    };

    const validPlayoffEntry = {
      teamId: "1",
      teamName: "Colorado Avalanche",
      appearances: 13,
      championships: 3,
      finals: 2,
      conferenceFinals: 2,
      secondRound: 4,
      firstRound: 2,
      seasons: [{ season: 2024, round: 5, key: "championship" }],
      tieRank: false,
    };

    const validRegularEntry = {
      teamId: "1",
      teamName: "Colorado Avalanche",
      wins: 355,
      losses: 79,
      ties: 46,
      points: 756,
      divWins: 86,
      divLosses: 24,
      divTies: 10,
      winPercent: 0.74,
      divWinPercent: 0.717,
      pointsPercent: 0.788,
      regularTrophies: 2,
      seasons: [
        {
          season: 2024,
          regularTrophy: true,
          wins: 35,
          losses: 7,
          ties: 6,
          points: 76,
          divWins: 8,
          divLosses: 2,
          divTies: 2,
          winPercent: 0.729,
          divWinPercent: 0.667,
          pointsPercent: 0.792,
        },
      ],
      tieRank: false,
    };

    const validCareerPlayer = {
      id: "p001",
      name: "Career Skater",
      position: "F",
      summary: {
        firstSeason: 2022,
        lastSeason: 2024,
        seasonCount: { owned: 3, played: 2 },
        teamCount: { owned: 2, played: 1 },
        teams: [
          {
            teamId: "1",
            teamName: "Colorado Avalanche",
            seasonCount: { owned: 2, played: 2 },
            firstSeason: 2022,
            lastSeason: 2024,
          },
        ],
      },
      totals: {
        career: {
          seasonCount: { owned: 3, played: 2 },
          teamCount: { owned: 2, played: 1 },
          teams: [
            {
              teamId: "1",
              teamName: "Colorado Avalanche",
              seasonCount: { owned: 2, played: 2 },
              games: 87,
              goals: 32,
              assists: 54,
              points: 86,
              plusMinus: 15,
              penalties: 20,
              shots: 255,
              ppp: 21,
              shp: 1,
              hits: 45,
              blocks: 34,
            },
          ],
          games: 87,
          goals: 32,
          assists: 54,
          points: 86,
          plusMinus: 15,
          penalties: 20,
          shots: 255,
          ppp: 21,
          shp: 1,
          hits: 45,
          blocks: 34,
        },
        regular: {
          seasonCount: { owned: 2, played: 1 },
          teamCount: { owned: 2, played: 1 },
          teams: [],
          games: 82,
          goals: 30,
          assists: 50,
          points: 80,
          plusMinus: 12,
          penalties: 18,
          shots: 240,
          ppp: 20,
          shp: 1,
          hits: 40,
          blocks: 30,
        },
        playoffs: {
          seasonCount: { owned: 2, played: 1 },
          teamCount: { owned: 1, played: 1 },
          teams: [],
          games: 5,
          goals: 2,
          assists: 4,
          points: 6,
          plusMinus: 3,
          penalties: 2,
          shots: 15,
          ppp: 1,
          shp: 0,
          hits: 5,
          blocks: 4,
        },
      },
      seasons: [
        {
          season: 2024,
          reportType: "regular",
          teamId: "1",
          teamName: "Colorado Avalanche",
          position: "F",
          games: 82,
          goals: 30,
          assists: 50,
          points: 80,
          plusMinus: 12,
          penalties: 18,
          shots: 240,
          ppp: 20,
          shp: 1,
          hits: 40,
          blocks: 30,
        },
      ],
    };

    const validCareerGoalie = {
      id: "g001",
      name: "Career Goalie",
      summary: {
        firstSeason: 2022,
        lastSeason: 2024,
        seasonCount: { owned: 3, played: 2 },
        teamCount: { owned: 2, played: 1 },
        teams: [
          {
            teamId: "2",
            teamName: "Carolina Hurricanes",
            seasonCount: { owned: 2, played: 2 },
            firstSeason: 2022,
            lastSeason: 2024,
          },
        ],
      },
      totals: {
        career: {
          seasonCount: { owned: 3, played: 2 },
          teamCount: { owned: 2, played: 1 },
          teams: [
            {
              teamId: "2",
              teamName: "Carolina Hurricanes",
              seasonCount: { owned: 2, played: 2 },
              games: 58,
              wins: 35,
              saves: 1610,
              shutouts: 5,
              goals: 0,
              assists: 4,
              points: 4,
              penalties: 2,
              ppp: 0,
              shp: 0,
            },
          ],
          games: 58,
          wins: 35,
          saves: 1610,
          shutouts: 5,
          goals: 0,
          assists: 4,
          points: 4,
          penalties: 2,
          ppp: 0,
          shp: 0,
        },
        regular: {
          seasonCount: { owned: 1, played: 1 },
          teamCount: { owned: 1, played: 1 },
          teams: [],
          games: 50,
          wins: 30,
          saves: 1400,
          shutouts: 4,
          goals: 0,
          assists: 3,
          points: 3,
          penalties: 2,
          ppp: 0,
          shp: 0,
        },
        playoffs: {
          seasonCount: { owned: 2, played: 1 },
          teamCount: { owned: 2, played: 1 },
          teams: [],
          games: 8,
          wins: 5,
          saves: 210,
          shutouts: 1,
          goals: 0,
          assists: 1,
          points: 1,
          penalties: 0,
          ppp: 0,
          shp: 0,
        },
      },
      seasons: [
        {
          season: 2024,
          reportType: "regular",
          teamId: "2",
          teamName: "Carolina Hurricanes",
          games: 50,
          wins: 30,
          saves: 1400,
          shutouts: 4,
          goals: 0,
          assists: 3,
          points: 3,
          penalties: 2,
          ppp: 0,
          shp: 0,
          gaa: "2.25",
          savePercent: "0.918",
        },
      ],
    };

    const validCareerPlayerListItem = {
      id: "p001",
      name: "Career Skater",
      position: "F",
      firstSeason: 2022,
      lastSeason: 2024,
      seasonsOwned: 3,
      seasonsPlayedRegular: 1,
      seasonsPlayedPlayoffs: 1,
      teamsOwned: 2,
      teamsPlayedRegular: 1,
      teamsPlayedPlayoffs: 1,
      regularGames: 82,
      playoffGames: 5,
    };

    const validCareerGoalieListItem = {
      id: "g001",
      name: "Career Goalie",
      firstSeason: 2022,
      lastSeason: 2024,
      seasonsOwned: 3,
      seasonsPlayedRegular: 1,
      seasonsPlayedPlayoffs: 1,
      teamsOwned: 2,
      teamsPlayedRegular: 1,
      teamsPlayedPlayoffs: 1,
      regularGames: 50,
      playoffGames: 8,
    };

    test("getTeams response conforms to Team[] schema", async () => {
      (getTeamsWithData as jest.Mock).mockReturnValue([validTeam]);
      const req = createRequest({ url: "/teams" });
      const res = createResponse();
      await getTeams(asRouteReq(req), res);
      const validate = buildArrayValidator("Team");
      expect(validate(getCapturedBody())).toBe(true);
    });

    test("getSeasons response conforms to Season[] schema", async () => {
      (getAvailableSeasons as jest.Mock).mockResolvedValue([validSeason]);
      const req = createRequest();
      const res = createResponse();
      await getSeasons(asRouteReq(req), res);
      const validate = buildArrayValidator("Season");
      expect(validate(getCapturedBody())).toBe(true);
    });

    test("getPlayersSeason response conforms to Player[] schema", async () => {
      (reportTypeAvailable as jest.Mock).mockReturnValue(true);
      (seasonAvailable as jest.Mock).mockResolvedValue(true);
      (parseSeasonParam as jest.Mock).mockReturnValue(2023);
      (getPlayersStatsSeason as jest.Mock).mockResolvedValue([validPlayer]);
      const req = createRequest({
        params: { reportType: "regular", season: "2023" },
      });
      const res = createResponse();
      await getPlayersSeason(asRouteReq(req), res);
      const validate = buildArrayValidator("Player");
      expect(validate(getCapturedBody())).toBe(true);
    });

    test("getPlayersCombined response conforms to CombinedPlayer[] schema", async () => {
      (reportTypeAvailable as jest.Mock).mockReturnValue(true);
      const validCombinedPlayer = {
        ...validPlayer,
        seasons: [{ ...validPlayer, season: 2023 }],
      };
      (getPlayersStatsCombined as jest.Mock).mockResolvedValue([
        validCombinedPlayer,
      ]);
      const req = createRequest({ params: { reportType: "regular" } });
      const res = createResponse();
      await getPlayersCombined(asRouteReq(req), res);
      const validate = buildArrayValidator("CombinedPlayer");
      expect(validate(getCapturedBody())).toBe(true);
    });

    test("getGoaliesSeason response conforms to Goalie[] schema", async () => {
      (reportTypeAvailable as jest.Mock).mockReturnValue(true);
      (seasonAvailable as jest.Mock).mockResolvedValue(true);
      (parseSeasonParam as jest.Mock).mockReturnValue(2023);
      (getGoaliesStatsSeason as jest.Mock).mockResolvedValue([validGoalie]);
      const req = createRequest({
        params: { reportType: "regular", season: "2023" },
      });
      const res = createResponse();
      await getGoaliesSeason(asRouteReq(req), res);
      const validate = buildArrayValidator("Goalie");
      expect(validate(getCapturedBody())).toBe(true);
    });

    test("getGoaliesCombined response conforms to CombinedGoalie[] schema", async () => {
      (reportTypeAvailable as jest.Mock).mockReturnValue(true);
      const validCombinedGoalie = {
        ...validGoalie,
        seasons: [{ ...validGoalie, season: 2023 }],
      };
      (getGoaliesStatsCombined as jest.Mock).mockResolvedValue([
        validCombinedGoalie,
      ]);
      const req = createRequest({ params: { reportType: "regular" } });
      const res = createResponse();
      await getGoaliesCombined(asRouteReq(req), res);
      const validate = buildArrayValidator("CombinedGoalie");
      expect(validate(getCapturedBody())).toBe(true);
    });

    test("getCareerPlayer response conforms to CareerPlayer schema", async () => {
      (getPlayerCareerData as jest.Mock).mockResolvedValue(validCareerPlayer);
      const req = createRequest({ params: { id: "p001" } });
      const res = createResponse();
      await getCareerPlayer(asRouteReq(req), res);
      const validate = buildObjectValidator("CareerPlayer");
      expect(validate(getCapturedBody())).toBe(true);
    });

    test("getCareerPlayers response conforms to CareerPlayerListItem[] schema", async () => {
      (getCareerPlayersData as jest.Mock).mockResolvedValue([
        validCareerPlayerListItem,
      ]);
      const req = createRequest({ method: "GET", url: "/career/players" });
      const res = createResponse();
      await getCareerPlayers(asRouteReq(req), res);
      const validate = buildArrayValidator("CareerPlayerListItem");
      expect(validate(getCapturedBody())).toBe(true);
    });

    test("getCareerGoalie response conforms to CareerGoalie schema", async () => {
      (getGoalieCareerData as jest.Mock).mockResolvedValue(validCareerGoalie);
      const req = createRequest({ params: { id: "g001" } });
      const res = createResponse();
      await getCareerGoalie(asRouteReq(req), res);
      const validate = buildObjectValidator("CareerGoalie");
      expect(validate(getCapturedBody())).toBe(true);
    });

    test("getCareerGoalies response conforms to CareerGoalieListItem[] schema", async () => {
      (getCareerGoaliesData as jest.Mock).mockResolvedValue([
        validCareerGoalieListItem,
      ]);
      const req = createRequest({ method: "GET", url: "/career/goalies" });
      const res = createResponse();
      await getCareerGoalies(asRouteReq(req), res);
      const validate = buildArrayValidator("CareerGoalieListItem");
      expect(validate(getCapturedBody())).toBe(true);
    });

    test("getPlayoffsLeaderboard response conforms to PlayoffLeaderboardEntry[] schema", async () => {
      (getPlayoffLeaderboardData as jest.Mock).mockResolvedValue([
        validPlayoffEntry,
      ]);
      const req = createRequest({
        method: "GET",
        url: "/leaderboard/playoffs",
      });
      const res = createResponse();
      await getPlayoffsLeaderboard(asRouteReq(req), res);
      const validate = buildArrayValidator("PlayoffLeaderboardEntry");
      expect(validate(getCapturedBody())).toBe(true);
    });

    test("getRegularLeaderboard response conforms to RegularLeaderboardEntry[] schema", async () => {
      (getRegularLeaderboardData as jest.Mock).mockResolvedValue([
        validRegularEntry,
      ]);
      const req = createRequest({ method: "GET", url: "/leaderboard/regular" });
      const res = createResponse();
      await getRegularLeaderboard(asRouteReq(req), res);
      const validate = buildArrayValidator("RegularLeaderboardEntry");
      expect(validate(getCapturedBody())).toBe(true);
    });
  });
});
