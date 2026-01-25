import type { Team } from "../types";

import type { TeamRun } from "./helpers";

export const computeManual2018PlayoffsTeamRuns = (teams: readonly Team[]): TeamRun[] => {
  // Fantrax playoffs data is corrupted for this league/season.
  // This is a one-off manual mapping based on known results.
  const startDate = "2019-03-04";

  const endByPresentName: Record<string, string> = {
    // Round 1 end
    "Winnipeg Jets": "2019-03-10",
    "Calgary Flames": "2019-03-10",
    "Vancouver Canucks": "2019-03-10",
    "Florida Panthers": "2019-03-10",
    "New Jersey Devils": "2019-03-10",
    "New York Islanders": "2019-03-10",
    "St. Louis Blues": "2019-03-10",
    "Tampa Bay Lightning": "2019-03-10",

    // Round 2 end
    "Nashville Predators": "2019-03-17",
    "Boston Bruins": "2019-03-17",
    "Dallas Stars": "2019-03-17",
    "Philadelphia Flyers": "2019-03-17",

    // Round 3 end
    "Anaheim Ducks": "2019-03-24",
    "Montreal Canadiens": "2019-03-24",

    // Final end
    "New York Rangers": "2019-04-06",
    "Colorado Avalanche": "2019-04-06",
  };

  const runs: TeamRun[] = [];
  for (const [presentName, endDate] of Object.entries(endByPresentName)) {
    const team = teams.find((t) => t.presentName === presentName);
    if (!team) {
      throw new Error(`Manual 2018 mapping references unknown team presentName: ${presentName}`);
    }
    runs.push({ ...team, startDate, endDate });
  }

  if (runs.length !== 16) {
    throw new Error(`Manual 2018 mapping must contain 16 teams (got ${runs.length})`);
  }

  return runs;
};
