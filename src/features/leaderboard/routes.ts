import type { RouteHandler } from "../../shared/router";
import {
  getPlayoffLeaderboardData,
  getRegularLeaderboardData,
  getTransactionLeaderboardData,
} from "./service";
import {
  getPlayoffsLeaderboardSnapshotKey,
  getRegularLeaderboardSnapshotKey,
  getTransactionsLeaderboardSnapshotKey,
} from "../../infra/snapshots/store";
import {
  loadSnapshotOrFallback,
  withErrorHandlingCached,
} from "../../shared/route-utils";

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
