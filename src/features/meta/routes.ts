import type { RouteHandler } from "../../shared/router.js";
import {
  getAvailableSeasons,
  getLastModifiedData,
  getTeamsData,
} from "./service.js";
import {
  parseSeasonParam,
  reportTypeAvailable,
} from "../../shared/seasons.js";
import { resolveTeamId } from "../../shared/teams.js";
import { ERROR_MESSAGES, HTTP_STATUS } from "../../shared/http.js";
import {
  getQueryParam,
  sendNoStore,
  withErrorHandlingCached,
} from "../../shared/route-utils.js";
import type { Report } from "../../shared/types/index.js";

export const getSeasons: RouteHandler = async (req, res) => {
  const teamId = resolveTeamId(getQueryParam(req, "teamId"));
  const startFrom = parseSeasonParam(getQueryParam(req, "startFrom"));

  const rawReport = req.params.reportType || "regular";
  if (!reportTypeAvailable(rawReport as Report)) {
    sendNoStore(
      res,
      HTTP_STATUS.BAD_REQUEST,
      ERROR_MESSAGES.INVALID_REPORT_TYPE,
    );
    return;
  }
  const report = rawReport as Report;

  await withErrorHandlingCached(req, res, async () => ({
    data: await getAvailableSeasons(teamId, report, startFrom),
    dataSource: "db",
  }));
};

export const getTeams: RouteHandler = async (req, res) => {
  await withErrorHandlingCached(req, res, async () => ({
    data: getTeamsData(),
    dataSource: "db",
  }));
};

export const getLastModified: RouteHandler = async (req, res) => {
  await withErrorHandlingCached(req, res, async () => ({
    data: { lastModified: await getLastModifiedData() },
    dataSource: "db",
  }));
};
