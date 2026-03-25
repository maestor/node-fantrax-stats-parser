import type { RouteHandler } from "../../shared/router.js";
import {
  getGoaliesStatsCombined,
  getGoaliesStatsSeason,
  getPlayersStatsCombined,
  getPlayersStatsSeason,
} from "./service.js";
import {
  getTeamStartSeason,
  resolveTeamId,
} from "../../shared/teams.js";
import {
  parseSeasonParam,
  reportTypeAvailable,
  seasonAvailable,
} from "../../shared/seasons.js";
import { getCombinedSnapshotKey } from "../../infra/snapshots/store.js";
import { ERROR_MESSAGES, HTTP_STATUS } from "../../shared/http.js";
import {
  getQueryParam,
  loadSnapshotOrFallback,
  sendNoStore,
  withErrorHandlingCached,
} from "../../shared/route-utils.js";
import type { Report } from "../../shared/types/index.js";

export const getPlayersSeason: RouteHandler = async (req, res) => {
  const teamId = resolveTeamId(getQueryParam(req, "teamId"));
  const season = parseSeasonParam(req.params.season);
  if (!reportTypeAvailable(req.params.reportType as Report)) {
    sendNoStore(
      res,
      HTTP_STATUS.BAD_REQUEST,
      ERROR_MESSAGES.INVALID_REPORT_TYPE,
    );
    return;
  }
  const report = req.params.reportType as Report;

  if (!(await seasonAvailable(season, teamId, report))) {
    sendNoStore(
      res,
      HTTP_STATUS.BAD_REQUEST,
      ERROR_MESSAGES.SEASON_NOT_AVAILABLE,
    );
    return;
  }

  await withErrorHandlingCached(req, res, async () => ({
    data: await getPlayersStatsSeason(report, season, teamId),
    dataSource: "db",
  }));
};

export const getPlayersCombined: RouteHandler = async (req, res) => {
  const teamId = resolveTeamId(getQueryParam(req, "teamId"));
  const startFrom = parseSeasonParam(getQueryParam(req, "startFrom"));
  if (!reportTypeAvailable(req.params.reportType as Report)) {
    sendNoStore(
      res,
      HTTP_STATUS.BAD_REQUEST,
      ERROR_MESSAGES.INVALID_REPORT_TYPE,
    );
    return;
  }
  const report = req.params.reportType as Report;
  const defaultStartFrom = getTeamStartSeason(teamId);

  await withErrorHandlingCached(req, res, () =>
    loadSnapshotOrFallback(
      startFrom === undefined || startFrom === defaultStartFrom
        ? getCombinedSnapshotKey("players", report, teamId)
        : undefined,
      () => getPlayersStatsCombined(report, teamId, startFrom),
    ),
  );
};

export const getGoaliesSeason: RouteHandler = async (req, res) => {
  const teamId = resolveTeamId(getQueryParam(req, "teamId"));
  const season = parseSeasonParam(req.params.season);
  if (!reportTypeAvailable(req.params.reportType as Report)) {
    sendNoStore(
      res,
      HTTP_STATUS.BAD_REQUEST,
      ERROR_MESSAGES.INVALID_REPORT_TYPE,
    );
    return;
  }
  const report = req.params.reportType as Report;

  if (!(await seasonAvailable(season, teamId, report))) {
    sendNoStore(
      res,
      HTTP_STATUS.BAD_REQUEST,
      ERROR_MESSAGES.SEASON_NOT_AVAILABLE,
    );
    return;
  }

  await withErrorHandlingCached(req, res, async () => ({
    data: await getGoaliesStatsSeason(report, season, teamId),
    dataSource: "db",
  }));
};

export const getGoaliesCombined: RouteHandler = async (req, res) => {
  const teamId = resolveTeamId(getQueryParam(req, "teamId"));
  const startFrom = parseSeasonParam(getQueryParam(req, "startFrom"));
  if (!reportTypeAvailable(req.params.reportType as Report)) {
    sendNoStore(
      res,
      HTTP_STATUS.BAD_REQUEST,
      ERROR_MESSAGES.INVALID_REPORT_TYPE,
    );
    return;
  }
  const report = req.params.reportType as Report;
  const defaultStartFrom = getTeamStartSeason(teamId);

  await withErrorHandlingCached(req, res, () =>
    loadSnapshotOrFallback(
      startFrom === undefined || startFrom === defaultStartFrom
        ? getCombinedSnapshotKey("goalies", report, teamId)
        : undefined,
      () => getGoaliesStatsCombined(report, teamId, startFrom),
    ),
  );
};
