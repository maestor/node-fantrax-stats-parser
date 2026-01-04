import { send } from "micro";
import { createRequest, createResponse } from "node-mocks-http";
import {
  getSeasons,
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
import { reportTypeAvailable, seasonAvailable, parseSeasonParam, ERROR_MESSAGES, HTTP_STATUS } from "../helpers";

jest.mock("micro");
jest.mock("../services");
jest.mock("../helpers");

describe("routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getSeasons", () => {
    test("returns 200 with available seasons", async () => {
      const mockSeasons = [{ season: 2012, text: "2012-2013" }];
      (getAvailableSeasons as jest.Mock).mockResolvedValue(mockSeasons);

      const req = createRequest();
      const res = createResponse();

      await getSeasons(req, res);

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
      expect(seasonAvailable).toHaveBeenCalledWith(2024);
      expect(getPlayersStatsSeason).toHaveBeenCalledWith("regular", 2024, "goals");
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

      expect(getPlayersStatsSeason).toHaveBeenCalledWith("regular", 2024, undefined);
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
      expect(getPlayersStatsCombined).toHaveBeenCalledWith("regular", "points");
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

      expect(getPlayersStatsCombined).toHaveBeenCalledWith("playoffs", "goals");
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

      expect(getPlayersStatsCombined).toHaveBeenCalledWith("regular", undefined);
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
      expect(seasonAvailable).toHaveBeenCalledWith(2024);
      expect(getGoaliesStatsSeason).toHaveBeenCalledWith("regular", 2024, "wins");
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

      expect(getGoaliesStatsSeason).toHaveBeenCalledWith("regular", 2024, undefined);
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
      expect(getGoaliesStatsCombined).toHaveBeenCalledWith("regular", "wins");
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

      expect(getGoaliesStatsCombined).toHaveBeenCalledWith("regular", undefined);
    });
  });
});
