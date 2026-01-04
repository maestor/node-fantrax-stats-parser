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

const GOALIE_SCHEMA_CHANGE_YEAR = 2013;

// CSV field mapping constants
const CSV_FIELD = {
  NAME: "field2" as const,
  SKATER_TYPE: "Skaters" as const,
  // Player fields
  PLAYER_GAMES: "field7" as const,
  PLAYER_GOALS: "field8" as const,
  PLAYER_ASSISTS: "field9" as const,
  PLAYER_POINTS: "field10" as const,
  PLAYER_PLUS_MINUS: "field11" as const,
  PLAYER_PENALTIES: "field12" as const,
  PLAYER_SHOTS: "field13" as const,
  PLAYER_PPP: "field14" as const,
  PLAYER_SHP: "field15" as const,
  PLAYER_HITS: "field16" as const,
  PLAYER_BLOCKS: "field17" as const,
  // Goalie fields (note: wins/games swap based on year)
  GOALIE_WINS_OR_GAMES_OLD: "field7" as const,
  GOALIE_GAMES_OR_WINS_OLD: "field8" as const,
  GOALIE_GAA: "field9" as const,
  GOALIE_SAVES: "field10" as const,
  GOALIE_SAVE_PERCENT: "field11" as const,
  GOALIE_SHUTOUTS: "field12" as const,
  GOALIE_PENALTIES: "field13" as const,
  GOALIE_GOALS: "field14" as const,
  GOALIE_ASSISTS: "field15" as const,
  GOALIE_POINTS: "field16" as const,
  GOALIE_PPP: "field17" as const,
  GOALIE_SHP: "field18" as const,
} as const;

export const mapPlayerData = (data: RawData[]): PlayerWithSeason[] => {
  return data
    .filter(
      (item: RawData, i: number) =>
        i !== 0 && item[CSV_FIELD.NAME] !== "" && item[CSV_FIELD.SKATER_TYPE] !== "G" && Number(item[CSV_FIELD.PLAYER_GAMES]) > 0
    )
    .map(
      (item: RawData): PlayerWithSeason => ({
        // Data have commas in thousands, pre-remove those that Number won't fail
        name: item[CSV_FIELD.NAME],
        games: Number(item[CSV_FIELD.PLAYER_GAMES].replace(",", "")) || 0,
        goals: Number(item[CSV_FIELD.PLAYER_GOALS].replace(",", "")) || 0,
        assists: Number(item[CSV_FIELD.PLAYER_ASSISTS].replace(",", "")) || 0,
        points: Number(item[CSV_FIELD.PLAYER_POINTS].replace(",", "")) || 0,
        plusMinus: Number(item[CSV_FIELD.PLAYER_PLUS_MINUS].replace(",", "")) || 0,
        penalties: Number(item[CSV_FIELD.PLAYER_PENALTIES].replace(",", "")) || 0,
        shots: Number(item[CSV_FIELD.PLAYER_SHOTS].replace(",", "")) || 0,
        ppp: Number(item[CSV_FIELD.PLAYER_PPP].replace(",", "")) || 0,
        shp: Number(item[CSV_FIELD.PLAYER_SHP].replace(",", "")) || 0,
        hits: Number(item[CSV_FIELD.PLAYER_HITS].replace(",", "")) || 0,
        blocks: Number(item[CSV_FIELD.PLAYER_BLOCKS].replace(",", "")) || 0,
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
        item[CSV_FIELD.NAME] !== "" &&
        item[CSV_FIELD.SKATER_TYPE] === "G" &&
        (Number(item[CSV_FIELD.GOALIE_WINS_OR_GAMES_OLD]) > 0 || Number(item[CSV_FIELD.GOALIE_GAMES_OR_WINS_OLD]) > 0)
    )
    .map((item: RawData): GoalieWithSeason => {
      let wins = 0;
      let games = 0;

      // Wins and games are different orders in different seasons -> dirty hack
      if (item.season <= GOALIE_SCHEMA_CHANGE_YEAR) {
        wins = Number(item[CSV_FIELD.GOALIE_GAMES_OR_WINS_OLD].replace(",", "")) || 0;
        games = Number(item[CSV_FIELD.GOALIE_WINS_OR_GAMES_OLD].replace(",", "")) || 0;
      } else {
        wins = Number(item[CSV_FIELD.GOALIE_WINS_OR_GAMES_OLD].replace(",", "")) || 0;
        games = Number(item[CSV_FIELD.GOALIE_GAMES_OR_WINS_OLD].replace(",", "")) || 0;
      }

      return {
        name: item[CSV_FIELD.NAME],
        games,
        wins,
        saves: Number(item[CSV_FIELD.GOALIE_SAVES].replace(",", "")) || 0,
        shutouts: Number(item[CSV_FIELD.GOALIE_SHUTOUTS].replace(",", "")) || 0,
        goals: Number(item[CSV_FIELD.GOALIE_GOALS].replace(",", "")) || 0,
        assists: Number(item[CSV_FIELD.GOALIE_ASSISTS].replace(",", "")) || 0,
        points: Number(item[CSV_FIELD.GOALIE_POINTS].replace(",", "")) || 0,
        penalties: Number(item[CSV_FIELD.GOALIE_PENALTIES].replace(",", "")) || 0,
        ppp: Number(item[CSV_FIELD.GOALIE_PPP].replace(",", "")) || 0,
        shp: item[CSV_FIELD.GOALIE_SHP] ? Number(item[CSV_FIELD.GOALIE_SHP].replace(",", "")) : 0,
        season: item.season,
        gaa: item[CSV_FIELD.GOALIE_GAA],
        savePercent: item[CSV_FIELD.GOALIE_SAVE_PERCENT],
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
