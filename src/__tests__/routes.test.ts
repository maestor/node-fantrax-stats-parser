import { send } from "micro";
import { createRequest, createResponse } from "node-mocks-http";
import {
  getSeasons,
  getTeams,
  getLastModified,
} from "../features/meta/routes";
import {
  getPlayersSeason,
  getPlayersCombined,
  getGoaliesSeason,
  getGoaliesCombined,
} from "../features/stats/routes";
import {
  getPlayoffsLeaderboard,
  getRegularLeaderboard,
  getTransactionsLeaderboard,
} from "../features/leaderboard/routes";
import { getHealthcheck } from "../index";
import {
  getAvailableSeasons,
  getLastModifiedData,
  getPlayersStatsSeason,
  getPlayersStatsCombined,
  getGoaliesStatsSeason,
  getGoaliesStatsCombined,
  getPlayoffLeaderboardData,
  getRegularLeaderboardData,
  getTeamsData,
  getTransactionLeaderboardData,
} from "../services";
import {
  reportTypeAvailable,
  seasonAvailable,
  parseSeasonParam,
  resolveTeamId,
} from "../helpers";
import { ERROR_MESSAGES, HTTP_STATUS } from "../constants";
import { makeEtagForJson } from "../cache";
import { loadSnapshot } from "../snapshots";
import { resetRouteCachesForTests } from "../shared/route-utils";
import { expectArraySchema } from "./openapi-schema";

jest.mock("micro");
jest.mock("../services");
jest.mock("../helpers");
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
  getTransactionsLeaderboardSnapshotKey: jest.fn(
    () => "leaderboard/transactions",
  ),
}));

type RouteReq = Parameters<typeof getSeasons>[0];
const asRouteReq = (req: unknown): RouteReq => req as RouteReq;
type RouteHandler = typeof getSeasons;

const primeRouteMocks = (): void => {
  resetRouteCachesForTests();
  (loadSnapshot as jest.Mock).mockResolvedValue(null);
  (resolveTeamId as jest.Mock).mockReturnValue("1");
  (reportTypeAvailable as jest.Mock).mockReturnValue(true);
  (seasonAvailable as jest.Mock).mockResolvedValue(true);
  (parseSeasonParam as jest.Mock).mockReturnValue(undefined);
};

describe("routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    primeRouteMocks();
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
      expectArraySchema("Season", mockSeasons);
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

  describe("route guards and generic service errors", () => {
    test("returns 400 for invalid report type across guarded routes", async () => {
      const cases: Array<{ handler: RouteHandler; req: ReturnType<typeof createRequest> }> = [
        {
          handler: getSeasons,
          req: createRequest({
            url: "/seasons/invalid",
            params: { reportType: "invalid" },
          }),
        },
        {
          handler: getPlayersSeason,
          req: createRequest({ params: { reportType: "invalid" } }),
        },
        {
          handler: getPlayersCombined,
          req: createRequest({ params: { reportType: "invalid" } }),
        },
        {
          handler: getGoaliesSeason,
          req: createRequest({ params: { reportType: "invalid" } }),
        },
        {
          handler: getGoaliesCombined,
          req: createRequest({ params: { reportType: "invalid" } }),
        },
      ];

      for (const routeCase of cases) {
        jest.clearAllMocks();
        primeRouteMocks();
        (reportTypeAvailable as jest.Mock).mockReturnValue(false);

        const res = createResponse();
        await routeCase.handler(asRouteReq(routeCase.req), res as never);

        expect(send).toHaveBeenCalledTimes(1);
        expect(send).toHaveBeenLastCalledWith(
          res,
          HTTP_STATUS.BAD_REQUEST,
          ERROR_MESSAGES.INVALID_REPORT_TYPE,
        );
      }
    });

    test("returns 500 when underlying services reject across route handlers", async () => {
      const cases: Array<{
        handler: RouteHandler;
        req: ReturnType<typeof createRequest>;
        arrange: (error: Error) => void;
      }> = [
        {
          handler: getSeasons,
          req: createRequest(),
          arrange: (error) => {
            (getAvailableSeasons as jest.Mock).mockRejectedValue(error);
          },
        },
        {
          handler: getPlayersSeason,
          req: createRequest({
            params: { reportType: "regular", season: "2024" },
          }),
          arrange: (error) => {
            (getPlayersStatsSeason as jest.Mock).mockRejectedValue(error);
          },
        },
        {
          handler: getPlayersCombined,
          req: createRequest({ params: { reportType: "regular" } }),
          arrange: (error) => {
            (getPlayersStatsCombined as jest.Mock).mockRejectedValue(error);
          },
        },
        {
          handler: getGoaliesSeason,
          req: createRequest({
            params: { reportType: "regular", season: "2024" },
          }),
          arrange: (error) => {
            (getGoaliesStatsSeason as jest.Mock).mockRejectedValue(error);
          },
        },
        {
          handler: getGoaliesCombined,
          req: createRequest({ params: { reportType: "regular" } }),
          arrange: (error) => {
            (getGoaliesStatsCombined as jest.Mock).mockRejectedValue(error);
          },
        },
        {
          handler: getPlayoffsLeaderboard,
          req: createRequest({
            method: "GET",
            url: "/leaderboard/playoffs",
          }),
          arrange: (error) => {
            (getPlayoffLeaderboardData as jest.Mock).mockRejectedValue(error);
          },
        },
        {
          handler: getRegularLeaderboard,
          req: createRequest({
            method: "GET",
            url: "/leaderboard/regular",
          }),
          arrange: (error) => {
            (getRegularLeaderboardData as jest.Mock).mockRejectedValue(error);
          },
        },
        {
          handler: getTransactionsLeaderboard,
          req: createRequest({
            method: "GET",
            url: "/leaderboard/transactions",
          }),
          arrange: (error) => {
            (getTransactionLeaderboardData as jest.Mock).mockRejectedValue(
              error,
            );
          },
        },
      ];

      for (const routeCase of cases) {
        jest.clearAllMocks();
        primeRouteMocks();
        const error = new Error("Service error");
        routeCase.arrange(error);

        const res = createResponse();
        await routeCase.handler(asRouteReq(routeCase.req), res as never);

        expect(send).toHaveBeenCalledTimes(1);
        expect(send).toHaveBeenLastCalledWith(
          res,
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          error,
        );
      }
    });
  });

  describe("getTransactionsLeaderboard", () => {
    test("returns leaderboard data from the transaction service", async () => {
      const payload = [
        {
          teamId: "1",
          teamName: "Colorado Avalanche",
          claims: 20,
          drops: 19,
          trades: 4,
          seasons: [
            {
              season: 2025,
              claims: 20,
              drops: 19,
              trades: 4,
            },
          ],
          tieRank: false,
        },
      ];
      (getTransactionLeaderboardData as jest.Mock).mockResolvedValue(payload);

      const req = createRequest({
        method: "GET",
        url: "/leaderboard/transactions",
      });
      const res = createResponse();

      await getTransactionsLeaderboard(asRouteReq(req), res);

      expect(getTransactionLeaderboardData).toHaveBeenCalledTimes(1);
      expect(res.getHeader("x-stats-data-source")).toBe("db");
      expectArraySchema("TransactionLeaderboardEntry", payload);
      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, payload);
    });
  });

  describe("getTeams", () => {
    test("returns 200 with configured teams", async () => {
      const filteredTeams = [
        {
          id: "1",
          name: "colorado",
          presentName: "Colorado Avalanche",
        },
      ];
      (getTeamsData as jest.Mock).mockReturnValue(filteredTeams);

      const req = createRequest();
      const res = createResponse();

      await getTeams(asRouteReq(req), res);

      expect(res.getHeader("x-stats-data-source")).toBe("db");
      expectArraySchema("Team", filteredTeams);
      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, filteredTeams);
    });

    test("memoizes successful responses and avoids re-calling the handler", async () => {
      const filteredTeams = [{ id: "1", name: "colorado" }];
      (getTeamsData as jest.Mock).mockReturnValue(filteredTeams);

      const req1 = createRequest({ url: "/teams" });
      const res1 = createResponse();
      await getTeams(asRouteReq(req1), res1);

      (send as jest.Mock).mockClear();
      const req2 = createRequest({ url: "/teams" });
      const res2 = createResponse();
      await getTeams(asRouteReq(req2), res2);

      expect(getTeamsData).toHaveBeenCalledTimes(1);
      expect(res2.getHeader("x-stats-data-source")).toBe("db");
      expect(send).toHaveBeenCalledWith(res2, HTTP_STATUS.OK, filteredTeams);
    });

    test("returns 304 for matching If-None-Match", async () => {
      const filteredTeams = [{ id: "1", name: "colorado" }];
      (getTeamsData as jest.Mock).mockReturnValue(filteredTeams);

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

      expect(getTeamsData).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledTimes(0);
      expect(res2.getHeader("x-stats-data-source")).toBe("db");
      expect(res2.statusCode).toBe(304);
      expect(endSpy).toHaveBeenCalled();
    });

    test("hits cached 304 branch on repeat request", async () => {
      const filteredTeams = [{ id: "1", name: "colorado" }];
      (getTeamsData as jest.Mock).mockReturnValue(filteredTeams);

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

      expect(getTeamsData).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledTimes(0);
      expect(cachedRes.statusCode).toBe(304);
      expect(endSpy).toHaveBeenCalled();
    });

    test("returns 304 on first request when If-None-Match matches freshly computed etag", async () => {
      const filteredTeams = [{ id: "1", name: "colorado" }];
      (getTeamsData as jest.Mock).mockReturnValue(filteredTeams);

      const etag = makeEtagForJson(filteredTeams);
      const req = {
        method: "GET",
        url: "/teams",
        headers: { host: "localhost", "if-none-match": etag },
      } as unknown as ReturnType<typeof createRequest>;
      const res = createResponse();
      const endSpy = jest.spyOn(res, "end");

      await getTeams(asRouteReq(req), res);

      expect(getTeamsData).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledTimes(0);
      expect(res.statusCode).toBe(304);
      expect(endSpy).toHaveBeenCalled();
    });

    test("works when req is undefined (no caching possible)", async () => {
      const filteredTeams = [{ id: "1", name: "colorado" }];
      (getTeamsData as jest.Mock).mockReturnValue(filteredTeams);

      const res = createResponse();
      await getTeams(undefined as unknown as RouteReq, res);

      expect(getTeamsData).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, filteredTeams);
    });
  });

  describe("getLastModified", () => {
    test("returns 304 on first request when If-None-Match matches freshly computed etag", async () => {
      const mockTimestamp = "2026-01-28T10:00:00.000Z";
      const mockResponse = { lastModified: mockTimestamp };
      (getLastModifiedData as jest.Mock).mockResolvedValue(mockTimestamp);

      const etag = makeEtagForJson(mockResponse);
      const req = {
        method: "GET",
        url: "/last-modified",
        headers: { host: "localhost", "if-none-match": etag },
      } as unknown as ReturnType<typeof createRequest>;
      const res = createResponse();
      const endSpy = jest.spyOn(res, "end");

      await getLastModified(asRouteReq(req), res);

      expect(getLastModifiedData).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledTimes(0);
      expect(res.statusCode).toBe(304);
      expect(endSpy).toHaveBeenCalled();
    });

    test("works when req is undefined (no caching possible)", async () => {
      const mockTimestamp = "2026-01-28T10:00:00.000Z";
      (getLastModifiedData as jest.Mock).mockResolvedValue(mockTimestamp);

      const res = createResponse();
      await getLastModified(undefined as unknown as RouteReq, res);

      expect(getLastModifiedData).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith(res, HTTP_STATUS.OK, {
        lastModified: "2026-01-28T10:00:00.000Z",
      });
    });
  });
});
