import { send } from "micro";
import { createRequest, createResponse } from "node-mocks-http";
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
  getRegularLeaderboard,
  resetRouteCachesForTests,
} from "../routes";
import {
  getAvailableSeasons,
  getPlayersStatsSeason,
  getPlayersStatsCombined,
  getGoaliesStatsSeason,
  getGoaliesStatsCombined,
  getPlayoffLeaderboardData,
  getRegularLeaderboardData,
} from "../services";
import {
  reportTypeAvailable,
  seasonAvailable,
  parseSeasonParam,
  resolveTeamId,
  getTeamsWithData,
  ERROR_MESSAGES,
  HTTP_STATUS,
} from "../helpers";
import { getLastModifiedFromDb } from "../db/queries";
import { makeEtagForJson } from "../cache";

jest.mock("micro");
jest.mock("../services");
jest.mock("../helpers");
jest.mock("../db/queries");

type RouteReq = Parameters<typeof getSeasons>[0];
const asRouteReq = (req: unknown): RouteReq => req as RouteReq;

describe("routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRouteCachesForTests();
    (resolveTeamId as jest.Mock).mockResolvedValue("1");
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
        })
      );
    });
  });

  describe("getSeasons", () => {
    test("returns 200 with available seasons", async () => {
      const mockSeasons = [{ season: 2012, text: "2012-2013" }];
      (getAvailableSeasons as jest.Mock).mockResolvedValue(mockSeasons);

      const req = createRequest();
      const res = createResponse();

      await getSeasons(asRouteReq(req), res);

      expect(getAvailableSeasons).toHaveBeenCalledWith("1", "regular", undefined);
      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, mockSeasons);
    });

    test("uses report type from path params when present", async () => {
      const mockSeasons = [{ season: 2012, text: "2012-2013" }];
      (getAvailableSeasons as jest.Mock).mockResolvedValue(mockSeasons);

      const req = createRequest({
        url: "/seasons/playoffs",
        params: { reportType: "playoffs" },
      });
      const res = createResponse();

      await getSeasons(asRouteReq(req), res);

      expect(getAvailableSeasons).toHaveBeenCalledWith("1", "playoffs", undefined);
      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, mockSeasons);
    });

    test("returns 500 on service error", async () => {
      const error = new Error("DB error");
      (getAvailableSeasons as jest.Mock).mockRejectedValue(error);

      const req = createRequest();
      const res = createResponse();

      await getSeasons(asRouteReq(req), res);

      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, error);
    });

    test("returns 400 for invalid report type path param", async () => {
      (reportTypeAvailable as jest.Mock).mockReturnValue(false);

      const req = createRequest({
        url: "/seasons/invalid",
        params: { reportType: "invalid" },
      });
      const res = createResponse();

      await getSeasons(asRouteReq(req), res);

      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.INVALID_REPORT_TYPE);
    });

    test("handles request without url (defaults query params)", async () => {
      const mockSeasons = [{ season: 2012, text: "2012-2013" }];
      (getAvailableSeasons as jest.Mock).mockResolvedValue(mockSeasons);

      const res = createResponse();

      await getSeasons(asRouteReq({} as unknown as ReturnType<typeof createRequest>), res);

      expect(getAvailableSeasons).toHaveBeenCalledWith("1", "regular", undefined);
      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, mockSeasons);
    });

    test("handles request with non-string url (defaults query params)", async () => {
      const mockSeasons = [{ season: 2012, text: "2012-2013" }];
      (getAvailableSeasons as jest.Mock).mockResolvedValue(mockSeasons);

      const req = { url: 123 } as unknown as ReturnType<typeof createRequest>;
      const res = createResponse();

      await getSeasons(asRouteReq(req), res);

      expect(getAvailableSeasons).toHaveBeenCalledWith("1", "regular", undefined);
      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, mockSeasons);
    });

    test("parses query params even when host header is not a string", async () => {
      const mockSeasons = [{ season: 2012, text: "2012-2013" }];
      (getAvailableSeasons as jest.Mock).mockResolvedValue(mockSeasons);
      (resolveTeamId as jest.Mock).mockImplementation(async (raw: unknown) =>
        typeof raw === "string" && raw ? raw : "1"
      );

      const req = {
        url: "/seasons?teamId=1",
        headers: { host: 123 },
      } as unknown as ReturnType<typeof createRequest>;
      const res = createResponse();

      await getSeasons(asRouteReq(req), res);

      expect(getAvailableSeasons).toHaveBeenCalledWith("1", "regular", undefined);
      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, mockSeasons);
    });

    test("parses query params with valid url but no headers object", async () => {
      const mockSeasons = [{ season: 2012, text: "2012-2013" }];
      (getAvailableSeasons as jest.Mock).mockResolvedValue(mockSeasons);
      (resolveTeamId as jest.Mock).mockImplementation(async (raw: unknown) =>
        typeof raw === "string" && raw ? raw : "1"
      );

      const req = { url: "/seasons?teamId=1" } as unknown as ReturnType<typeof createRequest>;
      const res = createResponse();

      await getSeasons(asRouteReq(req), res);

      expect(getAvailableSeasons).toHaveBeenCalledWith("1", "regular", undefined);
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

      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, error);
    });

    test("treats missing teamId query param as undefined", async () => {
      const mockSeasons = [{ season: 2012, text: "2012-2013" }];
      (getAvailableSeasons as jest.Mock).mockResolvedValue(mockSeasons);
      (resolveTeamId as jest.Mock).mockImplementation(async (raw: unknown) => (raw ? String(raw) : "1"));

      const req = createRequest({ url: "/seasons", headers: { host: "localhost" } });
      const res = createResponse();

      await getSeasons(asRouteReq(req), res);

      expect(resolveTeamId).toHaveBeenCalledWith(undefined);
      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, mockSeasons);
    });

    test("passes startFrom to service correctly", async () => {
      const mockSeasons = [{ season: 2020, text: "2020-2021" }];
      (getAvailableSeasons as jest.Mock).mockResolvedValue(mockSeasons);
      (parseSeasonParam as jest.Mock).mockReturnValue(2020);

      const req = createRequest({
        url: "/seasons?startFrom=2020",
        headers: { host: "localhost" },
      });
      const res = createResponse();

      await getSeasons(asRouteReq(req), res);

      expect(parseSeasonParam).toHaveBeenCalledWith("2020");
      expect(getAvailableSeasons).toHaveBeenCalledWith("1", "regular", 2020);
      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, mockSeasons);
    });

    test("works with startFrom query param", async () => {
      const mockSeasons = [{ season: 2018, text: "2018-2019" }];
      (getAvailableSeasons as jest.Mock).mockResolvedValue(mockSeasons);
      (parseSeasonParam as jest.Mock).mockReturnValue(2018);

      const req = createRequest({
        url: "/seasons/playoffs?startFrom=2018",
        params: { reportType: "playoffs" },
        headers: { host: "localhost" },
      });
      const res = createResponse();

      await getSeasons(asRouteReq(req), res);

      expect(getAvailableSeasons).toHaveBeenCalledWith("1", "playoffs", 2018);
      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, mockSeasons);
    });
  });

  describe("getTeams", () => {
    test("returns 200 with configured teams", async () => {
      const filteredTeams = [{ id: "1", name: "colorado" }];
      (getTeamsWithData as jest.Mock).mockResolvedValue(filteredTeams);

      const req = createRequest();
      const res = createResponse();

      await getTeams(asRouteReq(req), res);

      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, filteredTeams);
    });

    test("memoizes successful responses and avoids re-calling the handler", async () => {
      const filteredTeams = [{ id: "1", name: "colorado" }];
      (getTeamsWithData as jest.Mock).mockResolvedValue(filteredTeams);

      const req1 = createRequest({ url: "/teams" });
      const res1 = createResponse();
      await getTeams(asRouteReq(req1), res1);

      (send as jest.Mock).mockClear();
      const req2 = createRequest({ url: "/teams" });
      const res2 = createResponse();
      await getTeams(asRouteReq(req2), res2);

      expect(getTeamsWithData).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith(res2, HTTP_STATUS.OK, filteredTeams);
    });

    test("returns 304 for matching If-None-Match", async () => {
      const filteredTeams = [{ id: "1", name: "colorado" }];
      (getTeamsWithData as jest.Mock).mockResolvedValue(filteredTeams);

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
      expect(res2.statusCode).toBe(304);
      expect(endSpy).toHaveBeenCalled();
    });

    test("hits cached 304 branch on repeat request", async () => {
      const filteredTeams = [{ id: "1", name: "colorado" }];
      (getTeamsWithData as jest.Mock).mockResolvedValue(filteredTeams);

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
      (getTeamsWithData as jest.Mock).mockResolvedValue(filteredTeams);

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
      (getTeamsWithData as jest.Mock).mockResolvedValue(filteredTeams);

      const res = createResponse();
      await getTeams(undefined as unknown as RouteReq, res);

      expect(getTeamsWithData).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, filteredTeams);
    });
  });

  describe("getPlayersSeason", () => {
    test("returns 200 with player stats", async () => {
      const mockPlayers = [{ name: "Test Player", goals: 50 }];
      (reportTypeAvailable as jest.Mock).mockReturnValue(true);
      (seasonAvailable as jest.Mock).mockResolvedValue(true);
      (parseSeasonParam as jest.Mock).mockReturnValue(2024);
      (getPlayersStatsSeason as jest.Mock).mockResolvedValue(mockPlayers);

      const req = createRequest({
        params: {
          reportType: "regular",
          season: "2024",
        },
      });
      const res = createResponse();

      await getPlayersSeason(asRouteReq(req), res);

      expect(reportTypeAvailable).toHaveBeenCalledWith("regular");
      expect(seasonAvailable).toHaveBeenCalledWith(2024, "1", "regular");
      expect(getPlayersStatsSeason).toHaveBeenCalledWith("regular", 2024, "1");
      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, mockPlayers);
    });

    test("returns 400 for invalid report type", async () => {
      (reportTypeAvailable as jest.Mock).mockReturnValue(false);
      (seasonAvailable as jest.Mock).mockResolvedValue(true);

      const req = createRequest({
        params: { reportType: "invalid" },
      });
      const res = createResponse();

      await getPlayersSeason(asRouteReq(req), res);

      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.INVALID_REPORT_TYPE);
    });

    test("returns 400 for unavailable season", async () => {
      (reportTypeAvailable as jest.Mock).mockReturnValue(true);
      (seasonAvailable as jest.Mock).mockResolvedValue(false);

      const req = createRequest({
        params: { reportType: "regular", season: "2030" },
      });
      const res = createResponse();

      await getPlayersSeason(asRouteReq(req), res);

      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.SEASON_NOT_AVAILABLE);
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

      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, error);
    });
  });

  describe("getPlayersCombined", () => {
    test("returns 200 with combined player stats", async () => {
      const mockPlayers = [{ name: "Test Player", goals: 100, seasons: [] }];
      (reportTypeAvailable as jest.Mock).mockReturnValue(true);
      (getPlayersStatsCombined as jest.Mock).mockResolvedValue(mockPlayers);

      const req = createRequest({
        params: { reportType: "regular" },
      });
      const res = createResponse();

      await getPlayersCombined(asRouteReq(req), res);

      expect(reportTypeAvailable).toHaveBeenCalledWith("regular");
      expect(getPlayersStatsCombined).toHaveBeenCalledWith("regular", "1", undefined);
      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, mockPlayers);
    });

    test("returns 400 for invalid report type", async () => {
      (reportTypeAvailable as jest.Mock).mockReturnValue(false);

      const req = createRequest({
        params: { reportType: "invalid" },
      });
      const res = createResponse();

      await getPlayersCombined(asRouteReq(req), res);

      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.INVALID_REPORT_TYPE);
    });

    test("returns 500 on service error", async () => {
      const error = new Error("Service error");
      (reportTypeAvailable as jest.Mock).mockReturnValue(true);
      (getPlayersStatsCombined as jest.Mock).mockRejectedValue(error);

      const req = createRequest({
        params: { reportType: "regular" },
      });
      const res = createResponse();

      await getPlayersCombined(asRouteReq(req), res);

      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, error);
    });

    test("passes startFrom to service correctly", async () => {
      const mockPlayers = [{ name: "Test Player", goals: 100, seasons: [] }];
      (reportTypeAvailable as jest.Mock).mockReturnValue(true);
      (getPlayersStatsCombined as jest.Mock).mockResolvedValue(mockPlayers);
      (parseSeasonParam as jest.Mock).mockReturnValue(2020);

      const req = createRequest({
        url: "/players/combined/regular?startFrom=2020",
        params: { reportType: "regular" },
        headers: { host: "localhost" },
      });
      const res = createResponse();

      await getPlayersCombined(asRouteReq(req), res);

      expect(parseSeasonParam).toHaveBeenCalledWith("2020");
      expect(getPlayersStatsCombined).toHaveBeenCalledWith("regular", "1", 2020);
      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, mockPlayers);
    });

    test("works with startFrom query param", async () => {
      const mockPlayers = [{ name: "Test Player", goals: 100, seasons: [] }];
      (reportTypeAvailable as jest.Mock).mockReturnValue(true);
      (getPlayersStatsCombined as jest.Mock).mockResolvedValue(mockPlayers);
      (parseSeasonParam as jest.Mock).mockReturnValue(2018);

      const req = createRequest({
        url: "/players/combined/playoffs?startFrom=2018",
        params: { reportType: "playoffs" },
        headers: { host: "localhost" },
      });
      const res = createResponse();

      await getPlayersCombined(asRouteReq(req), res);

      expect(getPlayersStatsCombined).toHaveBeenCalledWith("playoffs", "1", 2018);
      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, mockPlayers);
    });
  });

  describe("getGoaliesSeason", () => {
    test("returns 200 with goalie stats", async () => {
      const mockGoalies = [{ name: "Test Goalie", wins: 40 }];
      (reportTypeAvailable as jest.Mock).mockReturnValue(true);
      (seasonAvailable as jest.Mock).mockResolvedValue(true);
      (parseSeasonParam as jest.Mock).mockReturnValue(2024);
      (getGoaliesStatsSeason as jest.Mock).mockResolvedValue(mockGoalies);

      const req = createRequest({
        params: { reportType: "regular", season: "2024" },
      });
      const res = createResponse();

      await getGoaliesSeason(asRouteReq(req), res);

      expect(reportTypeAvailable).toHaveBeenCalledWith("regular");
      expect(seasonAvailable).toHaveBeenCalledWith(2024, "1", "regular");
      expect(getGoaliesStatsSeason).toHaveBeenCalledWith("regular", 2024, "1");
      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, mockGoalies);
    });

    test("returns 400 for invalid report type", async () => {
      (reportTypeAvailable as jest.Mock).mockReturnValue(false);
      (seasonAvailable as jest.Mock).mockResolvedValue(true);

      const req = createRequest({
        params: { reportType: "invalid" },
      });
      const res = createResponse();

      await getGoaliesSeason(asRouteReq(req), res);

      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.INVALID_REPORT_TYPE);
    });

    test("returns 400 for unavailable season", async () => {
      (reportTypeAvailable as jest.Mock).mockReturnValue(true);
      (seasonAvailable as jest.Mock).mockResolvedValue(false);

      const req = createRequest({
        params: { reportType: "regular", season: "2030" },
      });
      const res = createResponse();

      await getGoaliesSeason(asRouteReq(req), res);

      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.SEASON_NOT_AVAILABLE);
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

      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, error);
    });
  });

  describe("getGoaliesCombined", () => {
    test("returns 200 with combined goalie stats", async () => {
      const mockGoalies = [{ name: "Test Goalie", wins: 100, seasons: [] }];
      (reportTypeAvailable as jest.Mock).mockReturnValue(true);
      (getGoaliesStatsCombined as jest.Mock).mockResolvedValue(mockGoalies);

      const req = createRequest({
        params: { reportType: "regular" },
      });
      const res = createResponse();

      await getGoaliesCombined(asRouteReq(req), res);

      expect(reportTypeAvailable).toHaveBeenCalledWith("regular");
      expect(getGoaliesStatsCombined).toHaveBeenCalledWith("regular", "1", undefined);
      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, mockGoalies);
    });

    test("returns 400 for invalid report type", async () => {
      (reportTypeAvailable as jest.Mock).mockReturnValue(false);

      const req = createRequest({
        params: { reportType: "invalid" },
      });
      const res = createResponse();

      await getGoaliesCombined(asRouteReq(req), res);

      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.INVALID_REPORT_TYPE);
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

      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, error);
    });

    test("passes startFrom to service correctly", async () => {
      const mockGoalies = [{ name: "Test Goalie", wins: 100, seasons: [] }];
      (reportTypeAvailable as jest.Mock).mockReturnValue(true);
      (getGoaliesStatsCombined as jest.Mock).mockResolvedValue(mockGoalies);
      (parseSeasonParam as jest.Mock).mockReturnValue(2020);

      const req = createRequest({
        url: "/goalies/combined/regular?startFrom=2020",
        params: { reportType: "regular" },
        headers: { host: "localhost" },
      });
      const res = createResponse();

      await getGoaliesCombined(asRouteReq(req), res);

      expect(parseSeasonParam).toHaveBeenCalledWith("2020");
      expect(getGoaliesStatsCombined).toHaveBeenCalledWith("regular", "1", 2020);
      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, mockGoalies);
    });

    test("works with startFrom query param", async () => {
      const mockGoalies = [{ name: "Test Goalie", wins: 100, seasons: [] }];
      (reportTypeAvailable as jest.Mock).mockReturnValue(true);
      (getGoaliesStatsCombined as jest.Mock).mockResolvedValue(mockGoalies);
      (parseSeasonParam as jest.Mock).mockReturnValue(2018);

      const req = createRequest({
        url: "/goalies/combined/playoffs?startFrom=2018",
        params: { reportType: "playoffs" },
        headers: { host: "localhost" },
      });
      const res = createResponse();

      await getGoaliesCombined(asRouteReq(req), res);

      expect(getGoaliesStatsCombined).toHaveBeenCalledWith("playoffs", "1", 2018);
      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, mockGoalies);
    });
  });

  describe("getLastModified", () => {
    test("returns 200 with timestamp from DB", async () => {
      const mockTimestamp = "2026-01-30T15:30:00.000Z";
      (getLastModifiedFromDb as jest.Mock).mockResolvedValue(mockTimestamp);

      const req = createRequest({ url: "/last-modified" });
      const res = createResponse();

      await getLastModified(asRouteReq(req), res);

      expect(getLastModifiedFromDb).toHaveBeenCalled();
      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, {
        lastModified: "2026-01-30T15:30:00.000Z",
      });
    });

    test("returns null when no metadata row exists", async () => {
      (getLastModifiedFromDb as jest.Mock).mockResolvedValue(null);

      const req = createRequest({ url: "/last-modified" });
      const res = createResponse();

      await getLastModified(asRouteReq(req), res);

      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, {
        lastModified: null,
      });
    });

    test("memoizes successful responses and avoids re-querying DB", async () => {
      const mockTimestamp = "2026-01-28T10:00:00.000Z";
      (getLastModifiedFromDb as jest.Mock).mockResolvedValue(mockTimestamp);

      const req1 = createRequest({ url: "/last-modified" });
      const res1 = createResponse();
      await getLastModified(asRouteReq(req1), res1);

      jest.clearAllMocks();
      (send as jest.Mock).mockClear();

      const req2 = createRequest({ url: "/last-modified" });
      const res2 = createResponse();
      await getLastModified(asRouteReq(req2), res2);

      expect(getLastModifiedFromDb).not.toHaveBeenCalled();
      expect(send).toHaveBeenCalledWith(res2, HTTP_STATUS.OK, {
        lastModified: "2026-01-28T10:00:00.000Z",
      });
    });

    test("returns 304 for matching If-None-Match", async () => {
      const mockTimestamp = "2026-01-28T10:00:00.000Z";
      const mockResponse = { lastModified: mockTimestamp };
      (getLastModifiedFromDb as jest.Mock).mockResolvedValue(mockTimestamp);

      const req1 = createRequest({ url: "/last-modified", method: "GET" });
      const res1 = createResponse();
      await getLastModified(asRouteReq(req1), res1);

      (send as jest.Mock).mockClear();
      const etag = makeEtagForJson(mockResponse);
      const req2 = {
        method: "GET",
        url: "/last-modified",
        headers: { host: "localhost", "if-none-match": etag },
      } as unknown as ReturnType<typeof createRequest>;
      const res2 = createResponse();
      const endSpy = jest.spyOn(res2, "end");

      await getLastModified(asRouteReq(req2), res2);

      expect(send).toHaveBeenCalledTimes(0);
      expect(res2.statusCode).toBe(304);
      expect(endSpy).toHaveBeenCalled();
    });

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

  describe("getRegularLeaderboard", () => {
    test("returns 200 with leaderboard data", async () => {
      const mockData = [
        {
          teamId: "1",
          teamName: "Colorado Avalanche",
          seasons: 10,
          wins: 355,
          losses: 79,
          ties: 46,
          points: 756,
          divWins: 86,
          divLosses: 24,
          divTies: 10,
          winPercent: 0.74,
          divWinPercent: 0.717,
          tieRank: false,
        },
      ];
      (getRegularLeaderboardData as jest.Mock).mockResolvedValue(mockData);

      const req = createRequest({ method: "GET", url: "/leaderboard/regular" });
      const res = createResponse();

      await getRegularLeaderboard(asRouteReq(req), res);

      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, mockData);
    });

    test("returns 200 with empty array when no data", async () => {
      (getRegularLeaderboardData as jest.Mock).mockResolvedValue([]);

      const req = createRequest({ method: "GET", url: "/leaderboard/regular" });
      const res = createResponse();

      await getRegularLeaderboard(asRouteReq(req), res);

      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, []);
    });

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
});
