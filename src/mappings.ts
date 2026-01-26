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
import { applyPlayerScores, applyGoalieScores } from "./helpers";
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
        score: 0,
        scoreAdjustedByGames: 0,
        season: item.season,
      })
    );
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
    { score: number; scoreAdjustedByGames: number; scores?: Record<string, number> }
  >();

  const playersBySeason = new Map<number, PlayerWithSeason[]>();
  for (const player of playersWithSeason) {
    const seasonPlayers = playersBySeason.get(player.season) ?? [];
    seasonPlayers.push(player);
    playersBySeason.set(player.season, seasonPlayers);
  }

  for (const [season, players] of playersBySeason) {
    applyPlayerScores(players);
    for (const player of players) {
      seasonScoreLookup.set(`${player.name}-${season}`, {
        score: player.score,
        scoreAdjustedByGames: player.scoreAdjustedByGames,
        scores: player.scores,
      });
    }
  }

  const combined = [
    ...playersWithSeason
      .reduce<Map<string, CombinedPlayer>>((r, currentItem: PlayerWithSeason) => {
        // Helper to get statfields for initializing and combining
        const itemKeys = Object.keys(currentItem).filter(
          (key) => key !== "name" && key !== "season" && key !== "score"
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
            score: 0,
            scoreAdjustedByGames: 0,
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

        const seasonKey = `${currentItem.name}-${currentItem.season}`;
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
      (item: RawData, i: number) =>
        i !== 0 &&
        item[CSV.NAME] !== "" &&
        item[CSV.SKATER_TYPE] === "G" &&
        (parseNumber(item[CSV.GOALIE_WINS_OR_GAMES_OLD]) > 0 ||
          parseWinsFromWG(item[CSV.GOALIE_GAMES_OR_WINS_OLD]) > 0)
    )
    .map((item: RawData): GoalieWithSeason => {
      return {
        name: item[CSV.NAME],
        // We normalize CSVs so goalies always use: field7 = GP, field8 = W-G.
        games: parseNumber(item[CSV.GOALIE_WINS_OR_GAMES_OLD]),
        wins: parseWinsFromWG(item[CSV.GOALIE_GAMES_OR_WINS_OLD]),
        saves: parseNumber(item[CSV.GOALIE_SAVES]),
        shutouts: parseNumber(item[CSV.GOALIE_SHUTOUTS]),
        goals: parseNumber(item[CSV.GOALIE_GOALS]),
        assists: parseNumber(item[CSV.GOALIE_ASSISTS]),
        points: parseNumber(item[CSV.GOALIE_POINTS]),
        penalties: parseNumber(item[CSV.GOALIE_PENALTIES]),
        ppp: parseNumber(item[CSV.GOALIE_PPP]),
        shp: parseNumber(item[CSV.GOALIE_SHP]),
        score: 0,
        scoreAdjustedByGames: 0,
        season: item.season,
        gaa: item[CSV.GOALIE_GAA],
        savePercent: item[CSV.GOALIE_SAVE_PERCENT],
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
      seasonScoreLookup.set(`${goalie.name}-${season}`, {
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
            key !== "season" &&
            key !== "gaa" &&
            key !== "savePercent" &&
            key !== "score"
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
            score: 0,
            scoreAdjustedByGames: 0,
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

        const seasonKey = `${currentItem.name}-${currentItem.season}`;
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
