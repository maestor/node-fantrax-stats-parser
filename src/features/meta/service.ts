import { DEFAULT_TEAM_ID } from "../../config";
import { getLastModifiedFromDb } from "../../db/queries";
import { availableSeasons } from "../../shared/seasons";
import { getTeamsWithData } from "../../shared/teams";
import type { Report } from "../../shared/types";
import { mapAvailableSeasons } from "../stats/mapping";

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
