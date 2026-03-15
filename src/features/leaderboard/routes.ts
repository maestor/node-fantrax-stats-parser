import { AugmentedRequestHandler } from "microrouter";
import {
  getPlayoffLeaderboardData,
  getRegularLeaderboardData,
  getTransactionLeaderboardData,
} from "../../services";
import {
  getPlayoffsLeaderboardSnapshotKey,
  getRegularLeaderboardSnapshotKey,
  getTransactionsLeaderboardSnapshotKey,
} from "../../snapshots";
import {
  loadSnapshotOrFallback,
  withErrorHandlingCached,
} from "../../shared/route-utils";

export const getPlayoffsLeaderboard: AugmentedRequestHandler = async (
  req,
  res,
) => {
  await withErrorHandlingCached(req, res, () =>
    loadSnapshotOrFallback(getPlayoffsLeaderboardSnapshotKey(), () =>
      getPlayoffLeaderboardData(),
    ),
  );
};

export const getRegularLeaderboard: AugmentedRequestHandler = async (
  req,
  res,
) => {
  await withErrorHandlingCached(req, res, () =>
    loadSnapshotOrFallback(getRegularLeaderboardSnapshotKey(), () =>
      getRegularLeaderboardData(),
    ),
  );
};

export const getTransactionsLeaderboard: AugmentedRequestHandler = async (
  req,
  res,
) => {
  await withErrorHandlingCached(req, res, () =>
    loadSnapshotOrFallback(getTransactionsLeaderboardSnapshotKey(), () =>
      getTransactionLeaderboardData(),
    ),
  );
};
