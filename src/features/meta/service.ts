import { DEFAULT_TEAM_ID } from "../../config/index.js";
import { getLastModifiedFromDb } from "../../db/queries.js";
import { availableSeasons } from "../../shared/seasons.js";
import { getTeamsWithData } from "../../shared/teams.js";
import type { Report } from "../../shared/types/index.js";
import { mapAvailableSeasons } from "../stats/mapping.js";

export const getAvailableSeasons = async (
  teamId: string = DEFAULT_TEAM_ID,
  reportType: Report = "regular",
  startFrom?: number,
) => {
  let seasons = await availableSeasons(teamId, reportType);

  if (startFrom !== undefined) {
    seasons = seasons.filter((season) => season >= startFrom);
  }

  return mapAvailableSeasons(seasons);
};

export const getTeamsData = () => getTeamsWithData();

export const getLastModifiedData = async () => {
  return getLastModifiedFromDb();
};
