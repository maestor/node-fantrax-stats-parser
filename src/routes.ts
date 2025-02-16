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
import { reportTypeAvailable, seasonAvailable, ERROR_MESSAGES } from "./helpers";

export const getSeasons: AugmentedRequestHandler = async (_req, res) => {
  try {
    const data = await getAvailableSeasons();
    send(res, 200, data);
  } catch (error) {
    send(res, 500, error);
  }
};

export const getPlayersSeason: AugmentedRequestHandler = async (req, res) => {
  const report = req.params.reportType as Report;
  const sortBy = req.params.sortBy as PlayerFields | undefined;
  const season: number | undefined = Number(req.params.season);

  if (!reportTypeAvailable(report)) {
    send(res, 400, ERROR_MESSAGES.INVALID_REPORT_TYPE);
  }

  if (!seasonAvailable(season)) {
    send(res, 400, ERROR_MESSAGES.SEASON_NOT_AVAILABLE);
  }

  try {
    const data = await getPlayersStatsSeason(report, season, sortBy);
    send(res, 200, data);
  } catch (error) {
    send(res, 500, error);
  }
};

export const getPlayersCombined: AugmentedRequestHandler = async (req, res) => {
  const report = req.params.reportType as Report;
  const sortBy = req.params.sortBy as PlayerFields | undefined;

  if (!reportTypeAvailable(report)) {
    send(res, 400, ERROR_MESSAGES.INVALID_REPORT_TYPE);
  }

  try {
    const data = await getPlayersStatsCombined(report, sortBy);
    send(res, 200, data);
  } catch (error) {
    send(res, 500, error);
  }
};

export const getGoaliesSeason: AugmentedRequestHandler = async (req, res) => {
  const report = req.params.reportType as Report;
  const sortBy = req.params.sortBy as GoalieFields | undefined;
  const season: number | undefined = Number(req.params.season);

  if (!reportTypeAvailable(report)) {
    send(res, 400, ERROR_MESSAGES.INVALID_REPORT_TYPE);
  }

  if (!seasonAvailable(season)) {
    send(res, 400, ERROR_MESSAGES.SEASON_NOT_AVAILABLE);
  }

  try {
    const data = await getGoaliesStatsSeason(report, season, sortBy);
    send(res, 200, data);
  } catch (error) {
    send(res, 500, error);
  }
};

export const getGoaliesCombined: AugmentedRequestHandler = async (req, res) => {
  const report = req.params.reportType as Report;
  const sortBy = req.params.sortBy as GoalieFields | undefined;

  if (!reportTypeAvailable(report)) {
    send(res, 400, ERROR_MESSAGES.INVALID_REPORT_TYPE);
  }

  try {
    const data = await getGoaliesStatsCombined(report, sortBy);
    send(res, 200, data);
  } catch (error) {
    send(res, 500, error);
  }
};
