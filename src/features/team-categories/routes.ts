import type { RouteHandler } from "../../shared/router.js";
import { getCategoryDashboardData } from "./service.js";
import { HTTP_STATUS } from "../../shared/http.js";
import {
  getQueryParam,
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
