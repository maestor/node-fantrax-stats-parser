import { mapAvailableSeasons } from "../../mappings";
import { DEFAULT_TEAM_ID } from "../../constants";
import { getLastModifiedFromDb } from "../../db/queries";
import { availableSeasons, getTeamsWithData } from "../../helpers";
import type { Report } from "../../types";

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
