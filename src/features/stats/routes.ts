import { AugmentedRequestHandler } from "microrouter";
import {
  getGoaliesStatsCombined,
  getGoaliesStatsSeason,
  getPlayersStatsCombined,
  getPlayersStatsSeason,
} from "../../services";
import type { Report } from "../../types";
import {
  getTeamStartSeason,
  parseSeasonParam,
  reportTypeAvailable,
  resolveTeamId,
  seasonAvailable,
} from "../../helpers";
import { getCombinedSnapshotKey } from "../../snapshots";
import { ERROR_MESSAGES, HTTP_STATUS } from "../../constants";
import {
  getQueryParam,
  loadSnapshotOrFallback,
  sendNoStore,
  withErrorHandlingCached,
} from "../../shared/route-utils";

export const getPlayersSeason: AugmentedRequestHandler = async (req, res) => {
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

export const getPlayersCombined: AugmentedRequestHandler = async (req, res) => {
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

export const getGoaliesSeason: AugmentedRequestHandler = async (req, res) => {
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

export const getGoaliesCombined: AugmentedRequestHandler = async (req, res) => {
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
