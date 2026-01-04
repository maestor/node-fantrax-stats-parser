import csv from 'csvtojson';
import path from 'path';

import { sortItemsByStatField, availableSeasons } from './helpers';
import {
  mapAvailableSeasons,
  mapPlayerData,
  mapGoalieData,
  mapCombinedPlayerData,
  mapCombinedGoalieData,
} from './mappings';
import { PlayerFields, GoalieFields, RawData, Report } from './types';

// Parser want seasons as array even in one season cases
const getSeasonParam = (season?: number): number[] => [
  season ?? Math.max(...availableSeasons()),
];

const getRawDataFromFiles = async (
  report: Report,
  seasons: number[],
): Promise<RawData[]> => {
  const sources = seasons.map(async (season) => {
    try {
      const sourceToJson = await csv().fromFile(
        `${path.join(__dirname, '../csv')}/${report}-${season}-${season + 1}.csv`,
      );

      return sourceToJson.map((item) => ({
        ...item,
        season,
      }));
    } catch {
      return [];
    }
  });
  const rawData = await Promise.all(sources);

  return rawData.flat();
};

export const getAvailableSeasons = async () => mapAvailableSeasons();

export const getPlayersStatsSeason = async (
  report: Report,
  season?: number,
  sortBy?: PlayerFields,
) => {
  const rawData = await getRawDataFromFiles(report, getSeasonParam(season));
  return sortItemsByStatField(mapPlayerData(rawData), 'players', sortBy);
};

export const getGoaliesStatsSeason = async (
  report: Report,
  season?: number,
  sortBy?: GoalieFields,
) => {
  const rawData = await getRawDataFromFiles(report, getSeasonParam(season));
  return sortItemsByStatField(mapGoalieData(rawData), 'goalies', sortBy);
};

export const getPlayersStatsCombined = async (
  report: Report,
  sortBy?: PlayerFields,
) => {
  const rawData = await getRawDataFromFiles(report, availableSeasons());
  return sortItemsByStatField(
    mapCombinedPlayerData(rawData),
    'players',
    sortBy,
  );
};

export const getGoaliesStatsCombined = async (
  report: Report,
  sortBy?: GoalieFields,
) => {
  const rawData = await getRawDataFromFiles(report, availableSeasons());
  return sortItemsByStatField(
    mapCombinedGoalieData(rawData),
    'goalies',
    sortBy,
  );
};
