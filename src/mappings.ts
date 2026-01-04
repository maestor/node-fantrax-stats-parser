import {
  RawData,
  Player,
  PlayerFields,
  Goalie,
  GoalieFields,
  PlayerWithSeason,
  CombinedPlayer,
  GoalieWithSeason,
  CombinedGoalie,
} from "./types";
import { availableSeasons } from "./helpers";

export const mapPlayerData = (data: RawData[]): PlayerWithSeason[] => {
  return data
    .filter(
      (item: RawData, i: number) =>
        i !== 0 && item.field2 !== "" && item.Skaters !== "G" && Number(item.field7) > 0
    )
    .map(
      (item: RawData): PlayerWithSeason => ({
        // Data have commas in thousands, pre-remove those that Number won't fail
        name: item.field2,
        games: Number(item.field7.replace(",", "")) || 0,
        goals: Number(item.field8.replace(",", "")) || 0,
        assists: Number(item.field9.replace(",", "")) || 0,
        points: Number(item.field10.replace(",", "")) || 0,
        plusMinus: Number(item.field11.replace(",", "")) || 0,
        penalties: Number(item.field12.replace(",", "")) || 0,
        shots: Number(item.field13.replace(",", "")) || 0,
        ppp: Number(item.field14.replace(",", "")) || 0,
        shp: Number(item.field15.replace(",", "")) || 0,
        hits: Number(item.field16.replace(",", "")) || 0,
        blocks: Number(item.field17.replace(",", "")) || 0,
        season: item.season,
      })
    );
};

export const mapCombinedPlayerData = (rawData: RawData[]): CombinedPlayer[] => [
  ...mapPlayerData(rawData)
    .reduce((r, currentItem: PlayerWithSeason) => {
      // Helper to get statfields for initializing and combining
      const itemKeys = Object.keys(currentItem).filter(
        (key) => key !== "name" && key !== "season"
      ) as PlayerFields[];

      let item = r.get(currentItem.name);

      if (!item) {
        item = {
          name: currentItem.name,
          games: 0,
          goals: 0,
          assists: 0,
          points: 0,
          plusMinus: 0,
          penalties: 0,
          shots: 0,
          ppp: 0,
          shp: 0,
          hits: 0,
          blocks: 0,
          seasons: [],
        };
        r.set(currentItem.name, item);
      }

      // Sum statfields to previously combined data
      itemKeys.forEach((itemKey) => {
        const key = itemKey as keyof Player;
        if (typeof item[key] === "number") {
          (item[key] as number) += currentItem[key] as number;
        }
      });

      // Add season data, with season as the first property
      const { name: _, season, ...restOfSeasonData } = currentItem;
      item.seasons.push({ season, ...restOfSeasonData });

      return r;
    }, new Map<string, CombinedPlayer>())
    .values(),
];

export const mapGoalieData = (data: RawData[]): GoalieWithSeason[] => {
  return data
    .filter(
      (item: RawData, i: number) =>
        i !== 0 &&
        item.field2 !== "" &&
        item.Skaters === "G" &&
        (Number(item.field7) > 0 || Number(item.field8) > 0)
    )
    .map((item: RawData): GoalieWithSeason => {
      let wins = 0;
      let games = 0;

      // Wins and games are different orders in different seasons -> dirty hack
      if (item.season <= 2013) {
        wins = Number(item.field8.replace(",", "")) || 0;
        games = Number(item.field7.replace(",", "")) || 0;
      } else {
        wins = Number(item.field7.replace(",", "")) || 0;
        games = Number(item.field8.replace(",", "")) || 0;
      }

      return {
        name: item.field2,
        games,
        wins,
        saves: Number(item.field10.replace(",", "")) || 0,
        shutouts: Number(item.field12.replace(",", "")) || 0,
        goals: Number(item.field14.replace(",", "")) || 0,
        assists: Number(item.field15.replace(",", "")) || 0,
        points: Number(item.field16.replace(",", "")) || 0,
        penalties: Number(item.field13.replace(",", "")) || 0,
        ppp: Number(item.field17.replace(",", "")) || 0,
        shp: item.field18 ? Number(item.field18.replace(",", "")) : 0,
        season: item.season,
        gaa: item.field9,
        savePercent: item.field11,
      };
    });
};

export const mapCombinedGoalieData = (rawData: RawData[]): CombinedGoalie[] => [
  ...mapGoalieData(rawData)
    .reduce((r, currentItem: GoalieWithSeason) => {
      // Helper to get statfields for initializing and combining
      const itemKeys = Object.keys(currentItem).filter(
        (key) => key !== "name" && key !== "season" && key !== "gaa" && key !== "savePercent"
      ) as GoalieFields[];

      let item = r.get(currentItem.name);

      if (!item) {
        item = {
          name: currentItem.name,
          games: 0,
          wins: 0,
          saves: 0,
          shutouts: 0,
          goals: 0,
          assists: 0,
          points: 0,
          penalties: 0,
          ppp: 0,
          shp: 0,
          seasons: [],
        };
        r.set(currentItem.name, item);
      }

      // Sum statfields to previously combined data
      itemKeys.forEach((itemKey) => {
        const key = itemKey as keyof Goalie;
        if (typeof item[key] === "number") {
          (item[key] as number) += currentItem[key] as number;
        }
      });

      // Add season data, with season as the first property
      const { name: _, season, ...restOfSeasonData } = currentItem;
      item.seasons.push({ season, ...restOfSeasonData });

      return r;
    }, new Map<string, CombinedGoalie>())
    .values(),
];

export const mapAvailableSeasons = () =>
  availableSeasons().map((season) => ({
    season,
    text: `${season}-${season + 1}`,
  }));
