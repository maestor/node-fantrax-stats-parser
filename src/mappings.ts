import {
  RawData,
  Player,
  Goalie,
  PlayerWithSeason,
  CombinedPlayer,
  GoalieWithSeason,
  CombinedGoalie,
} from "./types";
import { applyPlayerScores, applyPlayerScoresByPosition, applyGoalieScores } from "./helpers";
import { CSV } from "./constants";

// Data have commas in thousands, pre-remove those that Number won't fail
const parseNumber = (value: string) => {
  if (!value) {
    return 0;
  }
  const normalized = value.replace(/,/g, "");
  const result = Number(normalized);
  return Number.isNaN(result) ? 0 : result;
};

// Fantrax goalie exports sometimes provide wins as a single number (e.g. "19")
// or as W-G (e.g. "19-13"). We only want the wins component.
const parseWinsFromWG = (value: string) => {
  if (!value) return 0;
  const match = value.match(/^\s*(\d+)/);
  return match ? parseNumber(match[1]) : 0;
};

const FANTRAX_ID_IN_NAME_REGEX = /\*([A-Za-z0-9]+)\*/;

const parseFantraxId = (value: string): string | undefined => {
  const match = value.match(FANTRAX_ID_IN_NAME_REGEX);
  return match ? match[1] : undefined;
};

const getShiftedField = (item: RawData, key: string): string => {
  // "Skaters" acts as the first column key, but data rows now always keep
  // Fantrax's leading ID column there, so skater type starts at field2.
  if (key === CSV.SKATER_TYPE) {
    return item.field2;
  }

  const fieldNo = Number(key.slice(5)) + 1;
  const shiftedKey = `field${fieldNo}` as keyof RawData;
  const value = item[shiftedKey];
  return typeof value === "string" ? value : "";
};

const parseNameAndFantraxId = (rawName: string, rawId: string): { name: string; id: string } => {
  const name = rawName.replace(/\*[A-Za-z0-9]+\*/g, "").replace(/\s+/g, " ").trim();
  const id = parseFantraxId(rawId) ?? "";
  return {
    name,
    id,
  };
};

type MapCsvOptions = {
  includeZeroGames?: boolean;
};

const isHeaderRow = (item: RawData): boolean => {
  return item[CSV.SKATER_TYPE] === "ID" || getShiftedField(item, CSV.SKATER_TYPE) === "Pos";
};

export const mapPlayerData = (
  data: RawData[],
  options: MapCsvOptions = {}
): PlayerWithSeason[] => {
  return data
    .filter(
      (item: RawData, i: number) => {
        if (i === 0) return false;
        if (isHeaderRow(item)) return false;
        const skaterType = getShiftedField(item, CSV.SKATER_TYPE);
        const name = getShiftedField(item, CSV.NAME);
        const games = getShiftedField(item, CSV.PLAYER_GAMES);

        if (name === "" || skaterType === "G") {
          return false;
        }

        return options.includeZeroGames ? true : parseNumber(games) > 0;
      }
    )
    .map((item: RawData): PlayerWithSeason => {
      const skaterType = getShiftedField(item, CSV.SKATER_TYPE);
      const { name, id } = parseNameAndFantraxId(getShiftedField(item, CSV.NAME), item[CSV.SKATER_TYPE]);
      return {
        id,
        name,
        position: skaterType,
        games: parseNumber(getShiftedField(item, CSV.PLAYER_GAMES)),
        goals: parseNumber(getShiftedField(item, CSV.PLAYER_GOALS)),
        assists: parseNumber(getShiftedField(item, CSV.PLAYER_ASSISTS)),
        points: parseNumber(getShiftedField(item, CSV.PLAYER_POINTS)),
        plusMinus: parseNumber(getShiftedField(item, CSV.PLAYER_PLUS_MINUS)),
        penalties: parseNumber(getShiftedField(item, CSV.PLAYER_PENALTIES)),
        shots: parseNumber(getShiftedField(item, CSV.PLAYER_SHOTS)),
        ppp: parseNumber(getShiftedField(item, CSV.PLAYER_PPP)),
        shp: parseNumber(getShiftedField(item, CSV.PLAYER_SHP)),
        hits: parseNumber(getShiftedField(item, CSV.PLAYER_HITS)),
        blocks: parseNumber(getShiftedField(item, CSV.PLAYER_BLOCKS)),
        score: 0,
        scoreAdjustedByGames: 0,
        season: item.season,
      };
    });
};

/** @internal Test-only export that preserves the raw-data convenience wrapper. */
export const mapCombinedPlayerData = (rawData: RawData[]): CombinedPlayer[] => {
  return mapCombinedPlayerDataFromPlayersWithSeason(mapPlayerData(rawData));
};

export const mapCombinedPlayerDataFromPlayersWithSeason = (
  playersWithSeason: PlayerWithSeason[]
): CombinedPlayer[] => {
  // Compute per-season scores so that each season entry in the combined
  // response reflects the same scoring model as the single-season endpoints.
  const seasonScoreLookup = new Map<
    string,
    {
      score: number;
      scoreAdjustedByGames: number;
      scores?: Record<string, number>;
      scoreByPosition?: number;
      scoreByPositionAdjustedByGames?: number;
      scoresByPosition?: Record<string, number>;
    }
  >();

  const playersBySeason = new Map<number, PlayerWithSeason[]>();
  for (const player of playersWithSeason) {
    const seasonPlayers = playersBySeason.get(player.season) ?? [];
    seasonPlayers.push(player);
    playersBySeason.set(player.season, seasonPlayers);
  }

  for (const [season, players] of playersBySeason) {
    applyPlayerScores(players);
    applyPlayerScoresByPosition(players);
    for (const player of players) {
      seasonScoreLookup.set(`${player.id}-${season}`, {
        score: player.score,
        scoreAdjustedByGames: player.scoreAdjustedByGames,
        scores: player.scores,
        scoreByPosition: player.scoreByPosition,
        scoreByPositionAdjustedByGames: player.scoreByPositionAdjustedByGames,
        scoresByPosition: player.scoresByPosition,
      });
    }
  }

  const combined = [
    ...playersWithSeason
      .reduce<Map<string, CombinedPlayer>>((r, currentItem: PlayerWithSeason) => {
        // Helper to get statfields for initializing and combining
        const itemKeys = Object.keys(currentItem).filter(
          (key) =>
            key !== "name" &&
            key !== "id" &&
            key !== "position" &&
            key !== "season" &&
            key !== "score"
        ) as (keyof Player)[];

        const entityKey = currentItem.id;
        let item = r.get(entityKey);

        if (!item) {
          item = {
            id: currentItem.id,
            name: currentItem.name,
            position: currentItem.position,
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
            score: 0,
            scoreAdjustedByGames: 0,
            seasons: [],
          };
          r.set(entityKey, item);
        }

        // Sum statfields to previously combined data
        itemKeys.forEach((itemKey) => {
          if (typeof item[itemKey] === "number") {
            (item[itemKey] as number) += currentItem[itemKey] as number;
          }
        });

        const seasonKey = `${currentItem.id}-${currentItem.season}`;
        const seasonScores = seasonScoreLookup.get(seasonKey);

        // Add season data with per-season score information
        const {
          name: _name,
          season,
          score: _score,
          scoreAdjustedByGames: _scoreAdjustedByGames,
          scores: _scores,
          ...restOfSeasonData
        } = currentItem;

        item.seasons.push({
          season,
          ...restOfSeasonData,
          score: seasonScores?.score ?? 0,
          scoreAdjustedByGames: seasonScores?.scoreAdjustedByGames ?? 0,
          scores: seasonScores?.scores,
          scoreByPosition: seasonScores?.scoreByPosition,
          scoreByPositionAdjustedByGames: seasonScores?.scoreByPositionAdjustedByGames,
          scoresByPosition: seasonScores?.scoresByPosition,
        });

        return r;
      }, new Map<string, CombinedPlayer>())
      .values(),
  ];

  return combined;
};

export const mapGoalieData = (
  data: RawData[],
  options: MapCsvOptions = {}
): GoalieWithSeason[] => {
  const normalizeOptionalGoalieRate = (value: string): string | undefined =>
    value === "" || value === "0" ? undefined : value;

  return data
    .filter(
      (item: RawData, i: number) => {
        if (i === 0) return false;
        if (isHeaderRow(item)) return false;
        const skaterType = getShiftedField(item, CSV.SKATER_TYPE);
        const name = getShiftedField(item, CSV.NAME);
        const games = getShiftedField(item, CSV.GOALIE_WINS_OR_GAMES_OLD);
        const wins = getShiftedField(item, CSV.GOALIE_GAMES_OR_WINS_OLD);

        if (name === "" || skaterType !== "G") {
          return false;
        }

        return options.includeZeroGames ? true : parseNumber(games) > 0 || parseWinsFromWG(wins) > 0;
      }
    )
    .map((item: RawData): GoalieWithSeason => {
      const { name, id } = parseNameAndFantraxId(getShiftedField(item, CSV.NAME), item[CSV.SKATER_TYPE]);
      return {
        id,
        name,
        // We normalize CSVs so goalies always use: field7 = GP, field8 = W-G.
        games: parseNumber(getShiftedField(item, CSV.GOALIE_WINS_OR_GAMES_OLD)),
        wins: parseWinsFromWG(getShiftedField(item, CSV.GOALIE_GAMES_OR_WINS_OLD)),
        saves: parseNumber(getShiftedField(item, CSV.GOALIE_SAVES)),
        shutouts: parseNumber(getShiftedField(item, CSV.GOALIE_SHUTOUTS)),
        goals: parseNumber(getShiftedField(item, CSV.GOALIE_GOALS)),
        assists: parseNumber(getShiftedField(item, CSV.GOALIE_ASSISTS)),
        points: parseNumber(getShiftedField(item, CSV.GOALIE_POINTS)),
        penalties: parseNumber(getShiftedField(item, CSV.GOALIE_PENALTIES)),
        ppp: parseNumber(getShiftedField(item, CSV.GOALIE_PPP)),
        shp: parseNumber(getShiftedField(item, CSV.GOALIE_SHP)),
        score: 0,
        scoreAdjustedByGames: 0,
        season: item.season,
        gaa: normalizeOptionalGoalieRate(getShiftedField(item, CSV.GOALIE_GAA)),
        savePercent: normalizeOptionalGoalieRate(getShiftedField(item, CSV.GOALIE_SAVE_PERCENT)),
      };
    });
};

/** @internal Test-only export that preserves the raw-data convenience wrapper. */
export const mapCombinedGoalieData = (rawData: RawData[]): CombinedGoalie[] => {
  return mapCombinedGoalieDataFromGoaliesWithSeason(mapGoalieData(rawData));
};

export const mapCombinedGoalieDataFromGoaliesWithSeason = (
  goaliesWithSeason: GoalieWithSeason[]
): CombinedGoalie[] => {
  // Compute per-season scores for goalies so that each season entry in the
  // combined response matches the single-season goalie scoring model.
  const seasonScoreLookup = new Map<
    string,
    { score: number; scoreAdjustedByGames: number; scores?: Record<string, number> }
  >();

  const goaliesBySeason = new Map<number, GoalieWithSeason[]>();
  for (const goalie of goaliesWithSeason) {
    const seasonGoalies = goaliesBySeason.get(goalie.season) ?? [];
    seasonGoalies.push(goalie);
    goaliesBySeason.set(goalie.season, seasonGoalies);
  }

  for (const [season, goalies] of goaliesBySeason) {
    applyGoalieScores(goalies);
    for (const goalie of goalies) {
      seasonScoreLookup.set(`${goalie.id}-${season}`, {
        score: goalie.score,
        scoreAdjustedByGames: goalie.scoreAdjustedByGames,
        scores: goalie.scores,
      });
    }
  }

  const combined = [
    ...goaliesWithSeason
      .reduce<Map<string, CombinedGoalie>>((r, currentItem: GoalieWithSeason) => {
        // Helper to get statfields for initializing and combining
        const itemKeys = Object.keys(currentItem).filter(
          (key) =>
            key !== "name" &&
            key !== "id" &&
            key !== "season" &&
            key !== "gaa" &&
            key !== "savePercent" &&
            key !== "score"
        ) as (keyof Goalie)[];

        const entityKey = currentItem.id;
        let item = r.get(entityKey);

        if (!item) {
          item = {
            id: currentItem.id,
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
            score: 0,
            scoreAdjustedByGames: 0,
            seasons: [],
          };
          r.set(entityKey, item);
        }

        // Sum statfields to previously combined data
        itemKeys.forEach((itemKey) => {
          if (typeof item[itemKey] === "number") {
            (item[itemKey] as number) += currentItem[itemKey] as number;
          }
        });

        const seasonKey = `${currentItem.id}-${currentItem.season}`;
        const seasonScores = seasonScoreLookup.get(seasonKey);

        // Add season data with per-season score information and advanced stats
        const {
          name: _name,
          season,
          score: _score,
          scoreAdjustedByGames: _scoreAdjustedByGames,
          scores: _scores,
          ...restOfSeasonData
        } = currentItem;

        item.seasons.push({
          season,
          ...restOfSeasonData,
          score: seasonScores?.score ?? 0,
          scoreAdjustedByGames: seasonScores?.scoreAdjustedByGames ?? 0,
          scores: seasonScores?.scores,
        });

        return r;
      }, new Map<string, CombinedGoalie>())
      .values(),
  ];

  return combined;
};

export const mapAvailableSeasons = (seasons: number[]) =>
  seasons.map((season) => ({
    season,
    text: `${season}-${season + 1}`,
  }));
