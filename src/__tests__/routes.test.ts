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
  resetRouteCachesForTests,
} from "../routes";
import {
  getAvailableSeasons,
  getPlayersStatsSeason,
  getPlayersStatsCombined,
  getGoaliesStatsSeason,
  getGoaliesStatsCombined,
} from "../services";
import {
  reportTypeAvailable,
  seasonAvailable,
  parseSeasonParam,
  resolveTeamId,
  getTeamsWithCsvFolders,
  ERROR_MESSAGES,
  HTTP_STATUS,
} from "../helpers";
import { makeEtagForJson } from "../cache";

jest.mock("micro");
jest.mock("../services");
jest.mock("../helpers");

describe("routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRouteCachesForTests();
    (resolveTeamId as jest.Mock).mockReturnValue("1");
    (reportTypeAvailable as jest.Mock).mockReturnValue(true);
    (parseSeasonParam as jest.Mock).mockReturnValue(undefined);
  });

  describe("getHealthcheck", () => {
    test("returns 200 with ok status payload", async () => {
      const req = createRequest();
      const res = createResponse();

      await getHealthcheck(req, res);

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

      await getSeasons(req, res);

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

      await getSeasons(req, res);

      expect(getAvailableSeasons).toHaveBeenCalledWith("1", "playoffs", undefined);
      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, mockSeasons);
    });

    test("returns 500 on service error", async () => {
      const error = new Error("DB error");
      (getAvailableSeasons as jest.Mock).mockRejectedValue(error);

      const req = createRequest();
      const res = createResponse();

      await getSeasons(req, res);

      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, error);
    });

    test("returns 400 for invalid report type path param", async () => {
      (reportTypeAvailable as jest.Mock).mockReturnValue(false);

      const req = createRequest({
        url: "/seasons/invalid",
        params: { reportType: "invalid" },
      });
      const res = createResponse();

      await getSeasons(req, res);

      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.INVALID_REPORT_TYPE);
    });

    test("handles request without url (defaults query params)", async () => {
      const mockSeasons = [{ season: 2012, text: "2012-2013" }];
      (getAvailableSeasons as jest.Mock).mockResolvedValue(mockSeasons);

      const res = createResponse();

      await getSeasons({} as unknown as ReturnType<typeof createRequest>, res);

      expect(getAvailableSeasons).toHaveBeenCalledWith("1", "regular", undefined);
      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, mockSeasons);
    });

    test("handles request with non-string url (defaults query params)", async () => {
      const mockSeasons = [{ season: 2012, text: "2012-2013" }];
      (getAvailableSeasons as jest.Mock).mockResolvedValue(mockSeasons);

      const req = { url: 123 } as unknown as ReturnType<typeof createRequest>;
      const res = createResponse();

      await getSeasons(req, res);

      expect(getAvailableSeasons).toHaveBeenCalledWith("1", "regular", undefined);
      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, mockSeasons);
    });

    test("parses query params even when host header is not a string", async () => {
      const mockSeasons = [{ season: 2012, text: "2012-2013" }];
      (getAvailableSeasons as jest.Mock).mockResolvedValue(mockSeasons);
      (resolveTeamId as jest.Mock).mockImplementation((raw: unknown) =>
        typeof raw === "string" && raw ? raw : "1"
      );

      const req = {
        url: "/seasons?teamId=1",
        headers: { host: 123 },
      } as unknown as ReturnType<typeof createRequest>;
      const res = createResponse();

      await getSeasons(req, res);

      expect(getAvailableSeasons).toHaveBeenCalledWith("1", "regular", undefined);
      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, mockSeasons);
    });

    test("returns statusCode from typed error", async () => {
      const error = { statusCode: 422, message: "missing" };
      (getAvailableSeasons as jest.Mock).mockRejectedValue(error);

      const req = createRequest();
      const res = createResponse();

      await getSeasons(req, res);

      expect(send).toHaveBeenCalledWith(res, 422, error);
    });

    test("treats missing teamId query param as undefined", async () => {
      const mockSeasons = [{ season: 2012, text: "2012-2013" }];
      (getAvailableSeasons as jest.Mock).mockResolvedValue(mockSeasons);
      (resolveTeamId as jest.Mock).mockImplementation((raw: unknown) => (raw ? String(raw) : "1"));

      const req = createRequest({ url: "/seasons", headers: { host: "localhost" } });
      const res = createResponse();

      await getSeasons(req, res);

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

      await getSeasons(req, res);

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

      await getSeasons(req, res);

      expect(getAvailableSeasons).toHaveBeenCalledWith("1", "playoffs", 2018);
      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, mockSeasons);
    });
  });

  describe("getTeams", () => {
    test("returns 200 with configured teams", async () => {
      const filteredTeams = [{ id: "1", name: "colorado" }];
      (getTeamsWithCsvFolders as jest.Mock).mockReturnValue(filteredTeams);

      const req = createRequest();
      const res = createResponse();

      await getTeams(req, res);

      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, filteredTeams);
    });

    test("memoizes successful responses and avoids re-calling the handler", async () => {
      const filteredTeams = [{ id: "1", name: "colorado" }];
      (getTeamsWithCsvFolders as jest.Mock).mockReturnValue(filteredTeams);

      const req1 = createRequest({ url: "/teams" });
      const res1 = createResponse();
      await getTeams(req1, res1);

      (send as jest.Mock).mockClear();
      const req2 = createRequest({ url: "/teams" });
      const res2 = createResponse();
      await getTeams(req2, res2);

      expect(getTeamsWithCsvFolders).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith(res2, HTTP_STATUS.OK, filteredTeams);
    });

    test("returns 304 for matching If-None-Match", async () => {
      const filteredTeams = [{ id: "1", name: "colorado" }];
      (getTeamsWithCsvFolders as jest.Mock).mockReturnValue(filteredTeams);

      const req1 = createRequest({ url: "/teams", method: "GET" });
      const res1 = createResponse();
      await getTeams(req1, res1);

      (send as jest.Mock).mockClear();
      const etag = makeEtagForJson(filteredTeams);
      const req2 = {
        method: "GET",
        url: "/teams",
        headers: { host: "localhost", "if-none-match": etag },
      } as unknown as ReturnType<typeof createRequest>;
      const res2 = createResponse();
      const endSpy = jest.spyOn(res2, "end");
      await getTeams(req2, res2);

      expect(getTeamsWithCsvFolders).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledTimes(0);
      expect(res2.statusCode).toBe(304);
      expect(endSpy).toHaveBeenCalled();
    });

    test("hits cached 304 branch on repeat request", async () => {
      const filteredTeams = [{ id: "1", name: "colorado" }];
      (getTeamsWithCsvFolders as jest.Mock).mockReturnValue(filteredTeams);

      const primeReq = {
        method: "GET",
        url: "/teams",
        headers: { host: "localhost" },
      } as unknown as ReturnType<typeof createRequest>;
      const primeRes = createResponse();
      await getTeams(primeReq, primeRes);

      (send as jest.Mock).mockClear();

      const etag = makeEtagForJson(filteredTeams);
      const cachedReq = {
        method: "GET",
        url: "/teams",
        headers: { host: "localhost", "if-none-match": etag },
      } as unknown as ReturnType<typeof createRequest>;
      const cachedRes = createResponse();
      const endSpy = jest.spyOn(cachedRes, "end");

      await getTeams(cachedReq, cachedRes);

      expect(getTeamsWithCsvFolders).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledTimes(0);
      expect(cachedRes.statusCode).toBe(304);
      expect(endSpy).toHaveBeenCalled();
    });

    test("returns 304 on first request when If-None-Match matches freshly computed etag", async () => {
      const filteredTeams = [{ id: "1", name: "colorado" }];
      (getTeamsWithCsvFolders as jest.Mock).mockReturnValue(filteredTeams);

      const etag = makeEtagForJson(filteredTeams);
      const req = {
        method: "GET",
        url: "/teams",
        headers: { host: "localhost", "if-none-match": etag },
      } as unknown as ReturnType<typeof createRequest>;
      const res = createResponse();
      const endSpy = jest.spyOn(res, "end");

      await getTeams(req, res);

      expect(getTeamsWithCsvFolders).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledTimes(0);
      expect(res.statusCode).toBe(304);
      expect(endSpy).toHaveBeenCalled();
    });

    test("works when req is undefined (no caching possible)", async () => {
      const filteredTeams = [{ id: "1", name: "colorado" }];
      (getTeamsWithCsvFolders as jest.Mock).mockReturnValue(filteredTeams);

      const res = createResponse();
      await getTeams(undefined as unknown as ReturnType<typeof createRequest>, res);

      expect(getTeamsWithCsvFolders).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, filteredTeams);
    });
  });

  describe("getPlayersSeason", () => {
    test("returns 200 with player stats", async () => {
      const mockPlayers = [{ name: "Test Player", goals: 50 }];
      (reportTypeAvailable as jest.Mock).mockReturnValue(true);
      (seasonAvailable as jest.Mock).mockReturnValue(true);
      (parseSeasonParam as jest.Mock).mockReturnValue(2024);
      (getPlayersStatsSeason as jest.Mock).mockResolvedValue(mockPlayers);

      const req = createRequest({
        params: {
          reportType: "regular",
          season: "2024",
        },
      });
      const res = createResponse();

      await getPlayersSeason(req, res);

      expect(reportTypeAvailable).toHaveBeenCalledWith("regular");
      expect(seasonAvailable).toHaveBeenCalledWith(2024, "1", "regular");
      expect(getPlayersStatsSeason).toHaveBeenCalledWith("regular", 2024, "1");
      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, mockPlayers);
    });

    test("returns 400 for invalid report type", async () => {
      (reportTypeAvailable as jest.Mock).mockReturnValue(false);
      (seasonAvailable as jest.Mock).mockReturnValue(true);

      const req = createRequest({
        params: { reportType: "invalid" },
      });
      const res = createResponse();

      await getPlayersSeason(req, res);

      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.INVALID_REPORT_TYPE);
    });

    test("returns 400 for unavailable season", async () => {
      (reportTypeAvailable as jest.Mock).mockReturnValue(true);
      (seasonAvailable as jest.Mock).mockReturnValue(false);

      const req = createRequest({
        params: { reportType: "regular", season: "2030" },
      });
      const res = createResponse();

      await getPlayersSeason(req, res);

      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.SEASON_NOT_AVAILABLE);
    });

    test("returns 500 on service error", async () => {
      const error = new Error("Service error");
      (reportTypeAvailable as jest.Mock).mockReturnValue(true);
      (seasonAvailable as jest.Mock).mockReturnValue(true);
      (getPlayersStatsSeason as jest.Mock).mockRejectedValue(error);

      const req = createRequest({
        params: { reportType: "regular", season: "2024" },
      });
      const res = createResponse();

      await getPlayersSeason(req, res);

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

      await getPlayersCombined(req, res);

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

      await getPlayersCombined(req, res);

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

      await getPlayersCombined(req, res);

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

      await getPlayersCombined(req, res);

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

      await getPlayersCombined(req, res);

      expect(getPlayersStatsCombined).toHaveBeenCalledWith("playoffs", "1", 2018);
      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, mockPlayers);
    });
  });

  describe("getGoaliesSeason", () => {
    test("returns 200 with goalie stats", async () => {
      const mockGoalies = [{ name: "Test Goalie", wins: 40 }];
      (reportTypeAvailable as jest.Mock).mockReturnValue(true);
      (seasonAvailable as jest.Mock).mockReturnValue(true);
      (parseSeasonParam as jest.Mock).mockReturnValue(2024);
      (getGoaliesStatsSeason as jest.Mock).mockResolvedValue(mockGoalies);

      const req = createRequest({
        params: { reportType: "regular", season: "2024" },
      });
      const res = createResponse();

      await getGoaliesSeason(req, res);

      expect(reportTypeAvailable).toHaveBeenCalledWith("regular");
      expect(seasonAvailable).toHaveBeenCalledWith(2024, "1", "regular");
      expect(getGoaliesStatsSeason).toHaveBeenCalledWith("regular", 2024, "1");
      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, mockGoalies);
    });

    test("returns 400 for invalid report type", async () => {
      (reportTypeAvailable as jest.Mock).mockReturnValue(false);
      (seasonAvailable as jest.Mock).mockReturnValue(true);

      const req = createRequest({
        params: { reportType: "invalid" },
      });
      const res = createResponse();

      await getGoaliesSeason(req, res);

      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.INVALID_REPORT_TYPE);
    });

    test("returns 400 for unavailable season", async () => {
      (reportTypeAvailable as jest.Mock).mockReturnValue(true);
      (seasonAvailable as jest.Mock).mockReturnValue(false);

      const req = createRequest({
        params: { reportType: "regular", season: "2030" },
      });
      const res = createResponse();

      await getGoaliesSeason(req, res);

      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.SEASON_NOT_AVAILABLE);
    });

    test("returns 500 on service error", async () => {
      const error = new Error("Service error");
      (reportTypeAvailable as jest.Mock).mockReturnValue(true);
      (seasonAvailable as jest.Mock).mockReturnValue(true);
      (getGoaliesStatsSeason as jest.Mock).mockRejectedValue(error);

      const req = createRequest({
        params: { reportType: "regular", season: "2024" },
      });
      const res = createResponse();

      await getGoaliesSeason(req, res);

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

      await getGoaliesCombined(req, res);

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

      await getGoaliesCombined(req, res);

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

      await getGoaliesCombined(req, res);

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

      await getGoaliesCombined(req, res);

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

      await getGoaliesCombined(req, res);

      expect(getGoaliesStatsCombined).toHaveBeenCalledWith("playoffs", "1", 2018);
      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, mockGoalies);
    });
  });
});
