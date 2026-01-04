import { send } from "micro";
import { AugmentedRequestHandler, ServerResponse } from "microrouter";
import {
  getAvailableSeasons,
  getPlayersStatsSeason,
  getPlayersStatsCombined,
  getGoaliesStatsSeason,
  getGoaliesStatsCombined,
} from "./services";
import { PlayerFields, GoalieFields, Report } from "./types";
import { reportTypeAvailable, seasonAvailable, parseSeasonParam } from "./helpers";
import { HTTP_STATUS, ERROR_MESSAGES } from "./constants";

const withErrorHandling = async (res: ServerResponse, handler: () => Promise<unknown>) => {
  try {
    const data = await handler();
    send(res, HTTP_STATUS.OK, data);
  } catch (error) {
    send(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, error);
  }
};

export const getSeasons: AugmentedRequestHandler = async (_req, res) => {
  await withErrorHandling(res, () => getAvailableSeasons());
};

export const getPlayersSeason: AugmentedRequestHandler = async (req, res) => {
  const report = req.params.reportType as Report;
  const sortBy = req.params.sortBy as PlayerFields | undefined;
  const season = parseSeasonParam(req.params.season);

  if (!reportTypeAvailable(report)) {
    send(res, HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.INVALID_REPORT_TYPE);
    return;
  }

  if (!seasonAvailable(season)) {
    send(res, HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.SEASON_NOT_AVAILABLE);
    return;
  }

  await withErrorHandling(res, () => getPlayersStatsSeason(report, season, sortBy));
};

export const getPlayersCombined: AugmentedRequestHandler = async (req, res) => {
  const report = req.params.reportType as Report;
  const sortBy = req.params.sortBy as PlayerFields | undefined;

  if (!reportTypeAvailable(report)) {
    send(res, HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.INVALID_REPORT_TYPE);
    return;
  }

  await withErrorHandling(res, () => getPlayersStatsCombined(report, sortBy));
};

export const getGoaliesSeason: AugmentedRequestHandler = async (req, res) => {
  const report = req.params.reportType as Report;
  const sortBy = req.params.sortBy as GoalieFields | undefined;
  const season = parseSeasonParam(req.params.season);

  if (!reportTypeAvailable(report)) {
    send(res, HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.INVALID_REPORT_TYPE);
    return;
  }

  if (!seasonAvailable(season)) {
    send(res, HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.SEASON_NOT_AVAILABLE);
    return;
  }

  await withErrorHandling(res, () => getGoaliesStatsSeason(report, season, sortBy));
};

export const getGoaliesCombined: AugmentedRequestHandler = async (req, res) => {
  const report = req.params.reportType as Report;
  const sortBy = req.params.sortBy as GoalieFields | undefined;

  if (!reportTypeAvailable(report)) {
    send(res, HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.INVALID_REPORT_TYPE);
    return;
  }

  await withErrorHandling(res, () => getGoaliesStatsCombined(report, sortBy));
};
