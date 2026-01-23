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

jest.mock("micro");
jest.mock("../services");
jest.mock("../helpers");

describe("routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (resolveTeamId as jest.Mock).mockReturnValue("1");
    (reportTypeAvailable as jest.Mock).mockReturnValue(true);
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

      expect(getAvailableSeasons).toHaveBeenCalledWith("1", "regular");
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

      expect(getAvailableSeasons).toHaveBeenCalledWith("1", "playoffs");
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

      expect(getAvailableSeasons).toHaveBeenCalledWith("1", "regular");
      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, mockSeasons);
    });

    test("handles request with non-string url (defaults query params)", async () => {
      const mockSeasons = [{ season: 2012, text: "2012-2013" }];
      (getAvailableSeasons as jest.Mock).mockResolvedValue(mockSeasons);

      const req = { url: 123 } as unknown as ReturnType<typeof createRequest>;
      const res = createResponse();

      await getSeasons(req, res);

      expect(getAvailableSeasons).toHaveBeenCalledWith("1", "regular");
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

      expect(getAvailableSeasons).toHaveBeenCalledWith("1", "regular");
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
          sortBy: "goals",
        },
      });
      const res = createResponse();

      await getPlayersSeason(req, res);

      expect(reportTypeAvailable).toHaveBeenCalledWith("regular");
      expect(seasonAvailable).toHaveBeenCalledWith(2024, "1", "regular");
      expect(getPlayersStatsSeason).toHaveBeenCalledWith("regular", 2024, "goals", "1");
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

    test("works without sortBy parameter", async () => {
      const mockPlayers = [{ name: "Test Player", goals: 50 }];
      (reportTypeAvailable as jest.Mock).mockReturnValue(true);
      (seasonAvailable as jest.Mock).mockReturnValue(true);
      (parseSeasonParam as jest.Mock).mockReturnValue(2024);
      (getPlayersStatsSeason as jest.Mock).mockResolvedValue(mockPlayers);

      const req = createRequest({
        params: { reportType: "regular", season: "2024" },
      });
      const res = createResponse();

      await getPlayersSeason(req, res);

      expect(getPlayersStatsSeason).toHaveBeenCalledWith("regular", 2024, undefined, "1");
      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, mockPlayers);
    });
  });

  describe("getPlayersCombined", () => {
    test("returns 200 with combined player stats", async () => {
      const mockPlayers = [{ name: "Test Player", goals: 100, seasons: [] }];
      (reportTypeAvailable as jest.Mock).mockReturnValue(true);
      (getPlayersStatsCombined as jest.Mock).mockResolvedValue(mockPlayers);

      const req = createRequest({
        params: { reportType: "regular", sortBy: "points" },
      });
      const res = createResponse();

      await getPlayersCombined(req, res);

      expect(reportTypeAvailable).toHaveBeenCalledWith("regular");
      expect(getPlayersStatsCombined).toHaveBeenCalledWith("regular", "points", "1");
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

    test("passes sortBy to service correctly", async () => {
      const mockPlayers = [{ name: "Test Player", goals: 100, seasons: [] }];
      (reportTypeAvailable as jest.Mock).mockReturnValue(true);
      (getPlayersStatsCombined as jest.Mock).mockResolvedValue(mockPlayers);

      const req = createRequest({
        params: { reportType: "playoffs", sortBy: "goals" },
      });
      const res = createResponse();

      await getPlayersCombined(req, res);

      expect(getPlayersStatsCombined).toHaveBeenCalledWith("playoffs", "goals", "1");
    });

    test("works without sortBy parameter", async () => {
      const mockPlayers = [{ name: "Test Player", goals: 100, seasons: [] }];
      (reportTypeAvailable as jest.Mock).mockReturnValue(true);
      (getPlayersStatsCombined as jest.Mock).mockResolvedValue(mockPlayers);

      const req = createRequest({
        params: { reportType: "regular" },
      });
      const res = createResponse();

      await getPlayersCombined(req, res);

      expect(getPlayersStatsCombined).toHaveBeenCalledWith("regular", undefined, "1");
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
        params: { reportType: "regular", season: "2024", sortBy: "wins" },
      });
      const res = createResponse();

      await getGoaliesSeason(req, res);

      expect(reportTypeAvailable).toHaveBeenCalledWith("regular");
      expect(seasonAvailable).toHaveBeenCalledWith(2024, "1", "regular");
      expect(getGoaliesStatsSeason).toHaveBeenCalledWith("regular", 2024, "wins", "1");
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

    test("works without sortBy parameter", async () => {
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

      expect(getGoaliesStatsSeason).toHaveBeenCalledWith("regular", 2024, undefined, "1");
    });
  });

  describe("getGoaliesCombined", () => {
    test("returns 200 with combined goalie stats", async () => {
      const mockGoalies = [{ name: "Test Goalie", wins: 100, seasons: [] }];
      (reportTypeAvailable as jest.Mock).mockReturnValue(true);
      (getGoaliesStatsCombined as jest.Mock).mockResolvedValue(mockGoalies);

      const req = createRequest({
        params: { reportType: "regular", sortBy: "wins" },
      });
      const res = createResponse();

      await getGoaliesCombined(req, res);

      expect(reportTypeAvailable).toHaveBeenCalledWith("regular");
      expect(getGoaliesStatsCombined).toHaveBeenCalledWith("regular", "wins", "1");
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

    test("works without sortBy parameter", async () => {
      const mockGoalies = [{ name: "Test Goalie", wins: 100, seasons: [] }];
      (reportTypeAvailable as jest.Mock).mockReturnValue(true);
      (getGoaliesStatsCombined as jest.Mock).mockResolvedValue(mockGoalies);

      const req = createRequest({
        params: { reportType: "regular" },
      });
      const res = createResponse();

      await getGoaliesCombined(req, res);

      expect(getGoaliesStatsCombined).toHaveBeenCalledWith("regular", undefined, "1");
    });
  });
});
