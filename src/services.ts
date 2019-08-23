import csv from 'csvtojson';
import path from 'path';

import { RawData, Report } from './types';

export const getRawDataFromFiles = async (
  report: Report,
  seasons: string[],
): Promise<RawData[]> => {
  const sources = seasons.map(async season => {
    const sourceToJson = await csv().fromFile(
      path.join(__dirname, '../csv') + `/${report}-${season}.csv`,
    );
    return sourceToJson;
  });
  const rawData = await Promise.all(sources);

  return rawData.flat();
};
