export const buildRosterCsvUrlForSeason = (args: {
  leagueId: string;
  rosterTeamId: string;
  startDate: string;
  endDate: string;
  includeYearToDateSeason?: boolean;
}): string => {
  const url = new URL("https://www.fantrax.com/fxpa/downloadTeamRosterStats");
  url.search = new URLSearchParams({
    leagueId: args.leagueId,
    teamId: args.rosterTeamId,
    timeframeTypeCode: "BY_DATE",
    startDate: args.startDate,
    endDate: args.endDate,
    statsType: "3",
    view: "STATS",
    scoringCategoryType: "5",
  }).toString();
  if (args.includeYearToDateSeason) {
    url.searchParams.set("seasonOrProjection", "SEASON_31n_YEAR_TO_DATE");
  }
  return url.toString();
};
