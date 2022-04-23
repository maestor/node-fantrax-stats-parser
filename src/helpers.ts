import { Player, PlayerFields, Goalie, GoalieFields, Seasons } from './types';

const START_SEASON = 2012;
// Increase that for one always when coming new season stats
const SEASONS_TOTAL = 10;

const defaultSortPlayers = (a: Player, b: Player): number =>
  b.points - a.points || b.goals - a.goals;

const defaultSortGoalies = (a: Goalie, b: Goalie): number =>
  b.wins - a.wins || b.games - a.games;

export const sortItemsByStatField = (
  data: Player[] | Goalie[],
  kind: 'players' | 'goalies',
  sortBy?: PlayerFields | GoalieFields,
): Player[] | Goalie[] => {
  if (sortBy === 'name') {
    return data;
  }

  if (kind === 'players') {
    return data.sort((a: any, b: any) =>
      sortBy ? b[sortBy] - a[sortBy] : defaultSortPlayers(a, b),
    );
  } else if (kind === 'goalies') {
    return data.sort((a: any, b: any) =>
      sortBy ? b[sortBy] - a[sortBy] : defaultSortGoalies(a, b),
    );
  } else {
    return data;
  }
};

export const getAvailableSeasons = (): Seasons =>
  Array.from({ length: SEASONS_TOTAL }, (_, i) => i + START_SEASON);
