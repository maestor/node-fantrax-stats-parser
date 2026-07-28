import { FANTRAX_URLS } from "../../config/index.js";

export const buildRosterUrlForSeason = (args: {
  leagueId: string;
  rosterTeamId: string;
  startDate: string;
  endDate: string;
  includeYearToDateSeason?: boolean;
}): string => {
  const leagueId = encodeURIComponent(args.leagueId);
  const rosterTeamId = encodeURIComponent(args.rosterTeamId);
  const startDate = encodeURIComponent(args.startDate);
  const endDate = encodeURIComponent(args.endDate);
  const seasonOrProjection = args.includeYearToDateSeason
    ? ";seasonOrProjection=SEASON_31n_YEAR_TO_DATE"
    : "";

  return `${FANTRAX_URLS.league}/${leagueId}/team/roster;teamId=${rosterTeamId};timeframeTypeCode=BY_DATE;startDate=${startDate};endDate=${endDate}${seasonOrProjection};statsType=3`;
};
