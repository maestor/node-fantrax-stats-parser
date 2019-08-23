import { Player, PlayerFields, Seasons } from './types';

const defaultSort = (a: Player, b: Player): number =>
  b.points - a.points || b.goals - a.goals;

export const sortItemsByStatField = (
  data: Player[],
  sortBy?: PlayerFields,
): Player[] => {
  if (sortBy === 'name') {
    return data;
  }

  return data.sort((a, b) =>
    sortBy ? b[sortBy] - a[sortBy] : defaultSort(a, b),
  );
};

export const getAvailableSeasons = (): Seasons => [
  2012,
  2013,
  2014,
  2015,
  2016,
  2017,
  2018,
];
