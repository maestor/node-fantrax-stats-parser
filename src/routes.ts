import { send } from "micro";
import { AugmentedRequestHandler } from "microrouter";
import {
  getAvailableSeasons,
  getPlayersStatsSeason,
  getPlayersStatsCombined,
  getGoaliesStatsSeason,
  getGoaliesStatsCombined,
} from "./services";
import { PlayerFields, GoalieFields, Report } from "./types";
import { reportTypeAvailable, seasonAvailable, parseSeasonParam, ERROR_MESSAGES, HTTP_STATUS } from "./helpers";

export const getSeasons: AugmentedRequestHandler = async (_req, res) => {
  try {
    const data = await getAvailableSeasons();
    send(res, HTTP_STATUS.OK, data);
  } catch (error) {
    send(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, error);
  }
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

  try {
    const data = await getPlayersStatsSeason(report, season, sortBy);
    send(res, HTTP_STATUS.OK, data);
  } catch (error) {
    send(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, error);
  }
};

export const getPlayersCombined: AugmentedRequestHandler = async (req, res) => {
  const report = req.params.reportType as Report;
  const sortBy = req.params.sortBy as PlayerFields | undefined;

  if (!reportTypeAvailable(report)) {
    send(res, HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.INVALID_REPORT_TYPE);
    return;
  }

  try {
    const data = await getPlayersStatsCombined(report, sortBy);
    send(res, HTTP_STATUS.OK, data);
  } catch (error) {
    send(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, error);
  }
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

  try {
    const data = await getGoaliesStatsSeason(report, season, sortBy);
    send(res, HTTP_STATUS.OK, data);
  } catch (error) {
    send(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, error);
  }
};

export const getGoaliesCombined: AugmentedRequestHandler = async (req, res) => {
  const report = req.params.reportType as Report;
  const sortBy = req.params.sortBy as GoalieFields | undefined;

  if (!reportTypeAvailable(report)) {
    send(res, HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.INVALID_REPORT_TYPE);
    return;
  }

  try {
    const data = await getGoaliesStatsCombined(report, sortBy);
    send(res, HTTP_STATUS.OK, data);
  } catch (error) {
    send(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, error);
  }
};
