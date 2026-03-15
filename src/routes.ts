import { AugmentedRequestHandler } from "microrouter";
import { getTeamsWithData } from "./helpers";
import { getLastModifiedFromDb } from "./db/queries";
import { HTTP_STATUS } from "./constants";
import {
  resetRouteCachesForTests as resetSharedRouteCachesForTests,
  sendNoStore,
  withErrorHandlingCached,
} from "./shared/route-utils";

export * from "./features/stats/routes";
export * from "./features/career/routes";
export * from "./features/leaderboard/routes";

/** @internal Test-only export for clearing in-memory route caches. */
export const resetRouteCachesForTests = (): void => {
  resetSharedRouteCachesForTests();
};

export const getHealthcheck: AugmentedRequestHandler = async (_req, res) => {
  sendNoStore(res, HTTP_STATUS.OK, {
    status: "ok",
    uptimeSeconds: process.uptime(),
    timestamp: new Date().toISOString(),
  });
};

export const getTeams: AugmentedRequestHandler = async (req, res) => {
  await withErrorHandlingCached(req, res, async () => ({
    data: getTeamsWithData(),
    dataSource: "db",
  }));
};

export const getLastModified: AugmentedRequestHandler = async (req, res) => {
  await withErrorHandlingCached(req, res, async () => {
    const lastModified = await getLastModifiedFromDb();
    return {
      data: { lastModified },
      dataSource: "db",
    };
  });
};
