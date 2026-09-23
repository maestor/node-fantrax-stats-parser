import type { RouteHandler } from "../../shared/router.js";
import {
  getPlayoffLeaderboardData,
  getRegularLeaderboardData,
  getTransactionLeaderboardData,
} from "./service.js";
import {
  getPlayoffsLeaderboardSnapshotKey,
  getRegularLeaderboardSnapshotKey,
  getTransactionsLeaderboardSnapshotKey,
} from "../../infra/snapshots/store.js";
import {
  loadSnapshotOrFallback,
  withErrorHandlingCached,
} from "../../shared/route-utils.js";

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
