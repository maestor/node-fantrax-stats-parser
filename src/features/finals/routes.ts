import type { RouteHandler } from "../../shared/router.js";
import { withErrorHandlingCached } from "../../shared/route-utils.js";
import { getFinalsLeaderboardData } from "./service.js";

export const getFinalsLeaderboard: RouteHandler = async (req, res) => {
  await withErrorHandlingCached(req, res, async () => ({
    data: await getFinalsLeaderboardData(),
    dataSource: "db",
  }));
};
