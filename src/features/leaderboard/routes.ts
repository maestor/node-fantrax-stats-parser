import type { RouteHandler } from "../../shared/router.js";
import {
  getPlayoffLeaderboardData,
  getRegularLeaderboardData,
  getTransactionLeaderboardData,
} from "./service.js";
import { getCategoryDashboardData } from "./categories-service.js";
import {
  getPlayoffsLeaderboardSnapshotKey,
  getRegularLeaderboardSnapshotKey,
  getTransactionsLeaderboardSnapshotKey,
} from "../../infra/snapshots/store.js";
import { HTTP_STATUS } from "../../shared/http.js";
import {
  getQueryParam,
  loadSnapshotOrFallback,
  sendNoStore,
  withErrorHandlingCached,
} from "../../shared/route-utils.js";

export const getCategoryDashboard: RouteHandler = async (req, res) => {
  const rawSeason = getQueryParam(req, "season");
  const queryKeys = typeof req.url === "string"
    ? [...new URL(req.url, `http://${req.headers.host ?? "localhost"}`).searchParams.keys()]
    : [];
  if (queryKeys.some((key) => key !== "season") || (rawSeason !== undefined && !/^\d{4}$/.test(rawSeason))) {
    sendNoStore(res, HTTP_STATUS.BAD_REQUEST, "Invalid regular season");
    return;
  }
  await withErrorHandlingCached(req, res, async () => ({
    data: await getCategoryDashboardData(rawSeason),
    dataSource: "db",
  }));
};

export const getPlayoffsLeaderboard: RouteHandler = async (
  req,
  res,
) => {
  await withErrorHandlingCached(req, res, () =>
    loadSnapshotOrFallback(getPlayoffsLeaderboardSnapshotKey(), () =>
      getPlayoffLeaderboardData(),
    ),
  );
};

export const getRegularLeaderboard: RouteHandler = async (
  req,
  res,
) => {
  await withErrorHandlingCached(req, res, () =>
    loadSnapshotOrFallback(getRegularLeaderboardSnapshotKey(), () =>
      getRegularLeaderboardData(),
    ),
  );
};

export const getTransactionsLeaderboard: RouteHandler = async (
  req,
  res,
) => {
  await withErrorHandlingCached(req, res, () =>
    loadSnapshotOrFallback(getTransactionsLeaderboardSnapshotKey(), () =>
      getTransactionLeaderboardData(),
    ),
  );
};
