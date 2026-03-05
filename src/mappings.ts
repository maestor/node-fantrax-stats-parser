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

const hasLeadingIdColumn = (item: RawData): boolean => {
  return parseFantraxId(item[CSV.SKATER_TYPE]) !== undefined;
};

const getShiftedField = (item: RawData, key: string, offset: 0 | 1): string => {
  // "Skaters" acts as first data column; when ID is present, skater type shifts to field2.
  if (key === CSV.SKATER_TYPE) {
    return offset === 0 ? item[CSV.SKATER_TYPE] : item.field2;
  }

  const fieldNo = Number(key.slice(5)) + offset;
  const shiftedKey = `field${fieldNo}` as keyof RawData;
  const value = item[shiftedKey];
  return typeof value === "string" ? value : "";
};

const parseNameAndFantraxId = (rawName: string, rawId: string): { name: string; id?: string } => {
  const name = rawName.replace(/\*[A-Za-z0-9]+\*/g, "").replace(/\s+/g, " ").trim();
  const id = parseFantraxId(rawId) ?? parseFantraxId(rawName);
  return {
    name,
    ...(id ? { id } : {}),
  };
};

export const mapPlayerData = (data: RawData[]): PlayerWithSeason[] => {
  return data
    .filter(
      (item: RawData, i: number) => {
        if (i === 0) return false;
        const offset: 0 | 1 = hasLeadingIdColumn(item) ? 1 : 0;
        const skaterType = getShiftedField(item, CSV.SKATER_TYPE, offset);
        const name = getShiftedField(item, CSV.NAME, offset);
        const games = getShiftedField(item, CSV.PLAYER_GAMES, offset);

        return name !== "" && skaterType !== "G" && parseNumber(games) > 0;
      }
    )
    .map((item: RawData): PlayerWithSeason => {
      const offset: 0 | 1 = hasLeadingIdColumn(item) ? 1 : 0;
      const skaterType = getShiftedField(item, CSV.SKATER_TYPE, offset);
      const { name, id } = parseNameAndFantraxId(
        getShiftedField(item, CSV.NAME, offset),
        item[CSV.SKATER_TYPE]
      );
      return {
        name,
        ...(id ? { playerId: id } : {}),
        position: skaterType,
        games: parseNumber(getShiftedField(item, CSV.PLAYER_GAMES, offset)),
        goals: parseNumber(getShiftedField(item, CSV.PLAYER_GOALS, offset)),
        assists: parseNumber(getShiftedField(item, CSV.PLAYER_ASSISTS, offset)),
        points: parseNumber(getShiftedField(item, CSV.PLAYER_POINTS, offset)),
        plusMinus: parseNumber(getShiftedField(item, CSV.PLAYER_PLUS_MINUS, offset)),
        penalties: parseNumber(getShiftedField(item, CSV.PLAYER_PENALTIES, offset)),
        shots: parseNumber(getShiftedField(item, CSV.PLAYER_SHOTS, offset)),
        ppp: parseNumber(getShiftedField(item, CSV.PLAYER_PPP, offset)),
        shp: parseNumber(getShiftedField(item, CSV.PLAYER_SHP, offset)),
        hits: parseNumber(getShiftedField(item, CSV.PLAYER_HITS, offset)),
        blocks: parseNumber(getShiftedField(item, CSV.PLAYER_BLOCKS, offset)),
        score: 0,
        scoreAdjustedByGames: 0,
        season: item.season,
      };
    });
};

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
      seasonScoreLookup.set(`${player.playerId ?? player.name}-${season}`, {
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
            key !== "playerId" &&
            key !== "position" &&
            key !== "season" &&
            key !== "score"
        ) as (keyof Player)[];

        const entityKey = currentItem.playerId ?? currentItem.name;
        let item = r.get(entityKey);

        if (!item) {
          item = {
            name: currentItem.name,
            ...(currentItem.playerId ? { playerId: currentItem.playerId } : {}),
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

        const seasonKey = `${currentItem.playerId ?? currentItem.name}-${currentItem.season}`;
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

export const mapGoalieData = (data: RawData[]): GoalieWithSeason[] => {
  return data
    .filter(
      (item: RawData, i: number) => {
        if (i === 0) return false;
        const offset: 0 | 1 = hasLeadingIdColumn(item) ? 1 : 0;
        const skaterType = getShiftedField(item, CSV.SKATER_TYPE, offset);
        const name = getShiftedField(item, CSV.NAME, offset);
        const games = getShiftedField(item, CSV.GOALIE_WINS_OR_GAMES_OLD, offset);
        const wins = getShiftedField(item, CSV.GOALIE_GAMES_OR_WINS_OLD, offset);

        return (
          name !== "" &&
          skaterType === "G" &&
          (parseNumber(games) > 0 || parseWinsFromWG(wins) > 0)
        );
      }
    )
    .map((item: RawData): GoalieWithSeason => {
      const offset: 0 | 1 = hasLeadingIdColumn(item) ? 1 : 0;
      const { name, id } = parseNameAndFantraxId(
        getShiftedField(item, CSV.NAME, offset),
        item[CSV.SKATER_TYPE]
      );
      return {
        name,
        ...(id ? { goalieId: id } : {}),
        // We normalize CSVs so goalies always use: field7 = GP, field8 = W-G.
        games: parseNumber(getShiftedField(item, CSV.GOALIE_WINS_OR_GAMES_OLD, offset)),
        wins: parseWinsFromWG(getShiftedField(item, CSV.GOALIE_GAMES_OR_WINS_OLD, offset)),
        saves: parseNumber(getShiftedField(item, CSV.GOALIE_SAVES, offset)),
        shutouts: parseNumber(getShiftedField(item, CSV.GOALIE_SHUTOUTS, offset)),
        goals: parseNumber(getShiftedField(item, CSV.GOALIE_GOALS, offset)),
        assists: parseNumber(getShiftedField(item, CSV.GOALIE_ASSISTS, offset)),
        points: parseNumber(getShiftedField(item, CSV.GOALIE_POINTS, offset)),
        penalties: parseNumber(getShiftedField(item, CSV.GOALIE_PENALTIES, offset)),
        ppp: parseNumber(getShiftedField(item, CSV.GOALIE_PPP, offset)),
        shp: parseNumber(getShiftedField(item, CSV.GOALIE_SHP, offset)),
        score: 0,
        scoreAdjustedByGames: 0,
        season: item.season,
        gaa: getShiftedField(item, CSV.GOALIE_GAA, offset),
        savePercent: getShiftedField(item, CSV.GOALIE_SAVE_PERCENT, offset),
      };
    });
};

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
      seasonScoreLookup.set(`${goalie.goalieId ?? goalie.name}-${season}`, {
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
            key !== "goalieId" &&
            key !== "season" &&
            key !== "gaa" &&
            key !== "savePercent" &&
            key !== "score"
        ) as (keyof Goalie)[];

        const entityKey = currentItem.goalieId ?? currentItem.name;
        let item = r.get(entityKey);

        if (!item) {
          item = {
            name: currentItem.name,
            ...(currentItem.goalieId ? { goalieId: currentItem.goalieId } : {}),
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

        const seasonKey = `${currentItem.goalieId ?? currentItem.name}-${currentItem.season}`;
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
