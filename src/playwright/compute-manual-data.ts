import type { Team } from "../shared/types/index.js";

import type { TeamRunWithRound } from "./helpers.js";

type LeaguePeriods = {
  regularStartDate: string;
  regularEndDate: string;
  playoffsStartDate: string;
  playoffsEndDate: string;
};

export const MANUAL_2018_PLAYOFFS_START_DATE = "2019-03-04";

const addDaysIso = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const applyManualLeaguePeriodsOverrides = (
  year: number,
  periods: LeaguePeriods,
): LeaguePeriods => {
  if (year !== 2018) return periods;
  return {
    ...periods,
    playoffsStartDate: MANUAL_2018_PLAYOFFS_START_DATE,
    regularEndDate: addDaysIso(MANUAL_2018_PLAYOFFS_START_DATE, -1),
  };
};

export const computeManual2018PlayoffsTeamRuns = (
  teams: readonly Team[],
): TeamRunWithRound[] => {
  // Fantrax playoffs data is corrupted for this league/season.
  // This is a one-off manual mapping based on known results.
  const startDate = MANUAL_2018_PLAYOFFS_START_DATE;

  const CHAMPION = "Colorado Avalanche";

  // endDate encodes the round each team was eliminated in (or won).
  // round 1: eliminated first, round 4: finalist, champion: still round 4 endDate.
  const roundDataByPresentName: Record<
    string,
    { endDate: string; roundReached: number }
  > = {
    // Round 1 exits
    "Winnipeg Jets":       { endDate: "2019-03-10", roundReached: 1 },
    "Calgary Flames":      { endDate: "2019-03-10", roundReached: 1 },
    "Vancouver Canucks":   { endDate: "2019-03-10", roundReached: 1 },
    "Florida Panthers":    { endDate: "2019-03-10", roundReached: 1 },
    "New Jersey Devils":   { endDate: "2019-03-10", roundReached: 1 },
    "New York Islanders":  { endDate: "2019-03-10", roundReached: 1 },
    "St. Louis Blues":     { endDate: "2019-03-10", roundReached: 1 },
    "Tampa Bay Lightning": { endDate: "2019-03-10", roundReached: 1 },
    // Round 2 exits
    "Nashville Predators": { endDate: "2019-03-17", roundReached: 2 },
    "Boston Bruins":       { endDate: "2019-03-17", roundReached: 2 },
    "Dallas Stars":        { endDate: "2019-03-17", roundReached: 2 },
    "Philadelphia Flyers": { endDate: "2019-03-17", roundReached: 2 },
    // Round 3 exits (Conference Final)
    "Anaheim Ducks":       { endDate: "2019-03-24", roundReached: 3 },
    "Montreal Canadiens":  { endDate: "2019-03-24", roundReached: 3 },
    // Finalists (round 4)
    "New York Rangers":    { endDate: "2019-04-06", roundReached: 4 },
    "Colorado Avalanche":  { endDate: "2019-04-06", roundReached: 4 },
  };

  const runs: TeamRunWithRound[] = [];
  for (const [presentName, { endDate, roundReached }] of Object.entries(
    roundDataByPresentName,
  )) {
    const team = teams.find((t) => t.presentName === presentName);
    if (!team) {
      throw new Error(
        `Manual 2018 mapping references unknown team presentName: ${presentName}`,
      );
    }
    runs.push({
      ...team,
      startDate,
      endDate,
      roundReached,
      isChampion: presentName === CHAMPION,
    });
  }

  if (runs.length !== 16) {
    throw new Error(
      `Manual 2018 mapping must contain 16 teams (got ${runs.length})`,
    );
  }

  return runs;
};
