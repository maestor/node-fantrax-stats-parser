import { buildRosterUrlForSeason } from "../features/fantrax/roster-url.js";

describe("Fantrax roster URL builder", () => {
  test("builds the regular roster-by-date URL without season projection override by default", () => {
    expect(
      buildRosterUrlForSeason({
        leagueId: "league 1",
        rosterTeamId: "team/2",
        startDate: "2025-10-07",
        endDate: "2026-03-15",
      }),
    ).toBe(
      "https://www.fantrax.com/fantasy/league/league%201/team/roster;teamId=team%2F2;timeframeTypeCode=BY_DATE;startDate=2025-10-07;endDate=2026-03-15;statsType=3",
    );
  });

  test("adds year-to-date season selection for current regular season imports", () => {
    expect(
      buildRosterUrlForSeason({
        leagueId: "league 1",
        rosterTeamId: "team/2",
        startDate: "2026-10-07",
        endDate: "2027-03-15",
        includeYearToDateSeason: true,
      }),
    ).toBe(
      "https://www.fantrax.com/fantasy/league/league%201/team/roster;teamId=team%2F2;timeframeTypeCode=BY_DATE;startDate=2026-10-07;endDate=2027-03-15;seasonOrProjection=SEASON_31n_YEAR_TO_DATE;statsType=3",
    );
  });
});
