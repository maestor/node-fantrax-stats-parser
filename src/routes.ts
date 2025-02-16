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
} from "./helpers";

export const getSeasons: AugmentedRequestHandler = async (_req, res) => {
  send(res, 200, mapAvailableSeasons());
};

export const getPlayersSeason: AugmentedRequestHandler = async (req, res) => {
  const report = req.params.reportType as Report;
  const sortBy = req.params.sortBy as PlayerFields | undefined;
  const season: number | undefined = Number(req.params.season);

  if (!reportTypeAvailable(report)) {
    send(res, 400, "Invalid report type");
  }

  if (!seasonAvailable(season)) {
    send(res, 400, "Stats for this season are not available");
  }

  const rawData = await getRawDataFromFiles(report, getSeasonParam(season));

  send(res, 200, sortItemsByStatField(mapPlayerData(rawData), "players", sortBy));
};

export const getPlayersCombined: AugmentedRequestHandler = async (req, res) => {
  const report = req.params.reportType as Report;
  const sortBy = req.params.sortBy as PlayerFields | undefined;

  if (!reportTypeAvailable(report)) {
    send(res, 400, "Invalid report type");
  }

  const rawData = await getRawDataFromFiles(report, getAvailableSeasons());

  send(res, 200, sortItemsByStatField(mapCombinedPlayerData(rawData), "players", sortBy));
};

export const getGoaliesSeason: AugmentedRequestHandler = async (req, res) => {
  const report = req.params.reportType as Report;
  const sortBy = req.params.sortBy as GoalieFields | undefined;
  const season: number | undefined = Number(req.params.season);

  if (!reportTypeAvailable(report)) {
    send(res, 400, "Invalid report type");
  }

  if (!seasonAvailable(season)) {
    send(res, 400, "Stats for this season are not available");
  }

  const rawData = await getRawDataFromFiles(report, getSeasonParam(season));

  send(res, 200, sortItemsByStatField(mapGoalieData(rawData), "goalies", sortBy));
};

export const getGoaliesCombined: AugmentedRequestHandler = async (req, res) => {
  const report = req.params.reportType as Report;
  const sortBy = req.params.sortBy as GoalieFields | undefined;

  if (report !== "playoffs" && report !== "regular") {
    send(res, 400, "Invalid report type");
  }

  const rawData = await getRawDataFromFiles(report, getAvailableSeasons());

  send(res, 200, sortItemsByStatField(mapCombinedGoalieData(rawData), "goalies", sortBy));
};
