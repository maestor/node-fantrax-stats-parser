import { AugmentedRequestHandler } from "microrouter";
import {
  getAvailableSeasons,
  getLastModifiedData,
  getTeamsData,
} from "../../services";
import type { Report } from "../../types";
import {
  parseSeasonParam,
  reportTypeAvailable,
  resolveTeamId,
} from "../../helpers";
import { ERROR_MESSAGES, HTTP_STATUS } from "../../constants";
import {
  getQueryParam,
  sendNoStore,
  withErrorHandlingCached,
} from "../../shared/route-utils";

export const getSeasons: AugmentedRequestHandler = async (req, res) => {
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

export const getTeams: AugmentedRequestHandler = async (req, res) => {
  await withErrorHandlingCached(req, res, async () => ({
    data: getTeamsData(),
    dataSource: "db",
  }));
};

export const getLastModified: AugmentedRequestHandler = async (req, res) => {
  await withErrorHandlingCached(req, res, async () => ({
    data: { lastModified: await getLastModifiedData() },
    dataSource: "db",
  }));
};
