import csv from "csvtojson";
import path from "path";

import { RawData, Report } from "./types";

export const getRawDataFromFiles = async (
  report: Report,
  seasons: number[]
): Promise<RawData[]> => {
  const sources = seasons.map(async (season) => {
    const sourceToJson = await csv().fromFile(
      path.join(__dirname, "../csv") + `/${report}-${season}-${season + 1}.csv`
    );

    return sourceToJson.map((item) => ({
      ...item,
      season,
      isSeason: seasons.length === 1,
    }));
  });
  const rawData = await Promise.all(sources);

  return rawData.flat();
};
