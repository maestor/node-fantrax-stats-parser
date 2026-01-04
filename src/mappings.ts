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
import { CSV, GOALIE_SCHEMA_CHANGE_YEAR } from "./constants";

// Data have commas in thousands, pre-remove those that Number won't fail
const parseNumber = (value: string) => {
  try {
    return Number(value.replace(",", ""));
  } catch {
    return 0;
  }
};

export const mapPlayerData = (data: RawData[]): PlayerWithSeason[] => {
  return data
    .filter(
      (item: RawData, i: number) =>
        i !== 0 &&
        item[CSV.NAME] !== "" &&
        item[CSV.SKATER_TYPE] !== "G" &&
        parseNumber(item[CSV.PLAYER_GAMES]) > 0
    )
    .map(
      (item: RawData): PlayerWithSeason => ({
        name: item[CSV.NAME],
        games: parseNumber(item[CSV.PLAYER_GAMES]),
        goals: parseNumber(item[CSV.PLAYER_GOALS]),
        assists: parseNumber(item[CSV.PLAYER_ASSISTS]),
        points: parseNumber(item[CSV.PLAYER_POINTS]),
        plusMinus: parseNumber(item[CSV.PLAYER_PLUS_MINUS]),
        penalties: parseNumber(item[CSV.PLAYER_PENALTIES]),
        shots: parseNumber(item[CSV.PLAYER_SHOTS]),
        ppp: parseNumber(item[CSV.PLAYER_PPP]),
        shp: parseNumber(item[CSV.PLAYER_SHP]),
        hits: parseNumber(item[CSV.PLAYER_HITS]),
        blocks: parseNumber(item[CSV.PLAYER_BLOCKS]),
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
        item[CSV.NAME] !== "" &&
        item[CSV.SKATER_TYPE] === "G" &&
        (parseNumber(item[CSV.GOALIE_WINS_OR_GAMES_OLD]) > 0 ||
          parseNumber(item[CSV.GOALIE_GAMES_OR_WINS_OLD]) > 0)
    )
    .map((item: RawData): GoalieWithSeason => {
      let wins = 0;
      let games = 0;

      // Wins and games are different orders in different seasons -> dirty hack
      if (item.season <= GOALIE_SCHEMA_CHANGE_YEAR) {
        wins = parseNumber(item[CSV.GOALIE_GAMES_OR_WINS_OLD]);
        games = parseNumber(item[CSV.GOALIE_WINS_OR_GAMES_OLD]);
      } else {
        wins = parseNumber(item[CSV.GOALIE_WINS_OR_GAMES_OLD]);
        games = parseNumber(item[CSV.GOALIE_GAMES_OR_WINS_OLD]);
      }

      return {
        name: item[CSV.NAME],
        games,
        wins,
        saves: parseNumber(item[CSV.GOALIE_SAVES]),
        shutouts: parseNumber(item[CSV.GOALIE_SHUTOUTS]),
        goals: parseNumber(item[CSV.GOALIE_GOALS]),
        assists: parseNumber(item[CSV.GOALIE_ASSISTS]),
        points: parseNumber(item[CSV.GOALIE_POINTS]),
        penalties: parseNumber(item[CSV.GOALIE_PENALTIES]),
        ppp: parseNumber(item[CSV.GOALIE_PPP]),
        shp: parseNumber(item[CSV.GOALIE_SHP]),
        season: item.season,
        gaa: item[CSV.GOALIE_GAA],
        savePercent: item[CSV.GOALIE_SAVE_PERCENT],
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
