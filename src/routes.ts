import { send } from "micro";
import { AugmentedRequestHandler } from "microrouter";

import { getRawDataFromFiles } from "./services";
import {
  mapPlayerData,
  mapGoalieData,
  mapAvailableSeasons,
  mapCombinedPlayerData,
  mapCombinedGoalieData,
} from "./mappings";
import { PlayerFields, GoalieFields, Report } from "./types";
import {
  sortItemsByStatField,
  getAvailableSeasons,
  reportTypeAvailable,
  seasonAvailable,
  getSeasonParam,
  ERROR_MESSAGES,
} from "./helpers";

export const getSeasons: AugmentedRequestHandler = async (_req, res) => {
  const data = mapAvailableSeasons();

  send(res, 200, data);
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

  const rawData = await getRawDataFromFiles(report, getSeasonParam(season));
  const data = sortItemsByStatField(mapPlayerData(rawData), "players", sortBy);

  send(res, 200, data);
};

export const getPlayersCombined: AugmentedRequestHandler = async (req, res) => {
  const report = req.params.reportType as Report;
  const sortBy = req.params.sortBy as PlayerFields | undefined;

  if (!reportTypeAvailable(report)) {
    send(res, 400, ERROR_MESSAGES.INVALID_REPORT_TYPE);
  }

  const rawData = await getRawDataFromFiles(report, getAvailableSeasons());
  const data = sortItemsByStatField(mapCombinedPlayerData(rawData), "players", sortBy);

  send(res, 200, data);
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

  const rawData = await getRawDataFromFiles(report, getSeasonParam(season));
  const data = sortItemsByStatField(mapGoalieData(rawData), "goalies", sortBy);

  send(res, 200, data);
};

export const getGoaliesCombined: AugmentedRequestHandler = async (req, res) => {
  const report = req.params.reportType as Report;
  const sortBy = req.params.sortBy as GoalieFields | undefined;

  if (!reportTypeAvailable(report)) {
    send(res, 400, ERROR_MESSAGES.INVALID_REPORT_TYPE);
  }

  const rawData = await getRawDataFromFiles(report, getAvailableSeasons());
  const data = sortItemsByStatField(mapCombinedGoalieData(rawData), "goalies", sortBy);

  send(res, 200, data);
};
