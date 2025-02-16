import { RawData, Player, PlayerFields, Goalie, GoalieFields } from "./types";
import { availableSeasons } from "./helpers";

export const mapPlayerData = (data: RawData[]): Player[] => {
  return data
    .filter(
      (item: RawData, i: number) =>
        i !== 0 && item.field2 !== "" && item.Skaters !== "G" && Number(item.field7) > 0
    )
    .map(
      (item: RawData): Player => ({
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
      })
    );
};

export const mapCombinedPlayerData = (rawData: RawData[]): Player[] => [
  ...mapPlayerData(rawData)
    .reduce((r, currentItem: Player) => {
      // Helper to get statfields for initializing and combining
      const itemKeys = Object.keys(currentItem) as PlayerFields[];
      // Name field we don't need for this purposes
      delete itemKeys[itemKeys.findIndex((itemKey) => itemKey === "name")];

      // Initialize item (grouped by name) or use already existing one
      const item: Player = r.get(currentItem.name) || {
        ...currentItem,
        ...itemKeys.reduce((o, field) => ({ ...o, [field]: 0 }), {}),
      };

      // Sum statfields to previously combined data
      itemKeys.forEach((itemKey) => ((item[itemKey] as number) += currentItem[itemKey] as number));

      return r.set(currentItem.name, item);
    }, new Map())
    .values(),
];

export const mapGoalieData = (data: RawData[]): Goalie[] => {
  return data
    .filter(
      (item: RawData, i: number) =>
        i !== 0 &&
        item.field2 !== "" &&
        item.Skaters === "G" &&
        (Number(item.field7) > 0 || Number(item.field8) > 0)
    )
    .map((item: RawData): Goalie => {
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

      const base = {
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
      };

      return item.isSeason ? { ...base, gaa: item.field9, savePercent: item.field11 } : base;
    });
};

export const mapCombinedGoalieData = (rawData: RawData[]): Goalie[] => [
  ...mapGoalieData(rawData)
    .reduce((r, currentItem: Goalie) => {
      // Helper to get statfields for initializing and combining
      const itemKeys = Object.keys(currentItem) as GoalieFields[];
      // Name field we don't need for this purposes
      delete itemKeys[itemKeys.findIndex((itemKey) => itemKey === "name")];

      // Initialize item (grouped by name) or use already existing one
      const item: Goalie = r.get(currentItem.name) || {
        ...currentItem,
        ...itemKeys.reduce((o, field) => ({ ...o, [field]: 0 }), {}),
      };

      // Sum statfields to previously combined data
      itemKeys.forEach((itemKey) => ((item[itemKey] as number) += currentItem[itemKey] as number));

      return r.set(currentItem.name, item);
    }, new Map())
    .values(),
];

export const mapAvailableSeasons = () =>
  availableSeasons().map((season) => ({
    season,
    text: `${season}-${season + 1}`,
  }));
