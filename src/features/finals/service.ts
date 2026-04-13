import { TEAMS } from "../../config/index.js";
import {
  getFinalsCategories,
  getFinalsMatchups,
} from "../../db/queries.js";
import {
  calculateFinalsFactors,
  buildFinalsScoringContext,
  calculateWeightedEdgeRate,
  calculateWinRate,
  FINALS_DESERVED_TO_WIN_WEIGHTS,
} from "./scoring.js";
import type {
  FinalsCategory,
  FinalsCategoryDbEntry,
  FinalsLeaderboardEntry,
  FinalsMatchupDbEntry,
  FinalsTeam,
  FinalsTeamData,
} from "./types.js";

const getTeamName = (teamId: string): string =>
  TEAMS.find((team) => team.id === teamId)?.presentName ?? teamId;

const mapTeam = ({ isWinner: _isWinner, ...team }: FinalsTeamData): FinalsTeam => ({
  ...team,
  teamName: getTeamName(team.teamId),
});

const buildCategoriesBySeason = (
  rows: readonly FinalsCategoryDbEntry[],
): Map<number, FinalsCategory[]> => {
  const bySeason = new Map<number, FinalsCategory[]>();

  for (const row of rows) {
    const list = bySeason.get(row.season);
    const category: FinalsCategory = {
      statKey: row.statKey,
      awayValue: row.awayValue,
      homeValue: row.homeValue,
      winnerTeamId: row.winnerTeamId,
    };

    if (list) {
      list.push(category);
    } else {
      bySeason.set(row.season, [category]);
    }
  }

  return bySeason;
};

export const getFinalsLeaderboardData = async (): Promise<
  FinalsLeaderboardEntry[]
> => {
  const [matchups, categories] = await Promise.all([
    getFinalsMatchups(),
    getFinalsCategories(),
  ]);

  if (matchups.length === 0) {
    return [];
  }

  const matchupsBySeason = new Map<number, FinalsMatchupDbEntry>();
  for (const matchup of matchups) {
    matchupsBySeason.set(matchup.season, matchup);
  }

  const categoriesBySeason = buildCategoriesBySeason(
    categories.filter((category) => matchupsBySeason.has(category.season)),
  );
  const scoringContext = buildFinalsScoringContext(matchups);

  return matchups.map((matchup) => {
    const awayTeam = mapTeam(matchup.awayTeam);
    const homeTeam = mapTeam(matchup.homeTeam);
    const winnerTeamName =
      matchup.winnerTeamId === awayTeam.teamId ? awayTeam.teamName : homeTeam.teamName;

    return {
      season: matchup.season,
      wonOnHomeTiebreak: matchup.wonOnHomeTiebreak,
      winnerTeamId: matchup.winnerTeamId,
      winnerTeamName,
      awayTeam,
      homeTeam,
      categories: categoriesBySeason.get(matchup.season) ?? [],
      rates: {
        winRate: calculateWinRate(matchup),
        deservedToWinRate: calculateWeightedEdgeRate(
          matchup,
          FINALS_DESERVED_TO_WIN_WEIGHTS,
          scoringContext,
        ),
      },
      factors: calculateFinalsFactors(matchup),
    };
  });
};
