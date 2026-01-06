import fs from "fs";
import { Player, PlayerFields, Goalie, GoalieFields, Report, GoalieScoreField } from "./types";
import {
  REPORT_TYPES,
  START_SEASON,
  PLAYER_SCORE_FIELDS,
  GOALIE_SCORE_FIELDS,
  PLAYER_SCORE_WEIGHTS,
  GOALIE_SCORE_WEIGHTS,
  GOALIE_GAA_MAX_DIFF_RATIO,
  GOALIE_SAVE_PERCENT_BASELINE,
  MIN_GAMES_FOR_ADJUSTED_SCORE,
} from "./constants";

export { HTTP_STATUS, ERROR_MESSAGES } from "./constants";

const seasonsTotal = fs.readdirSync("./csv").filter((file) => file.includes("regular"));

const defaultSortPlayers = (a: Player, b: Player): number =>
  b.score - a.score || b.points - a.points || b.goals - a.goals;

const defaultSortGoalies = (a: Goalie, b: Goalie): number =>
  b.score - a.score || b.wins - a.wins || b.games - a.games;

const toTwoDecimals = (value: number): number => Number(value.toFixed(2));

const getMaxByField = <T, K extends keyof T>(items: T[], fields: K[]): Record<K, number> => {
  return fields.reduce(
    (acc, field) => {
      let max = 0;
      for (const item of items) {
        const raw = Number((item as unknown as Record<K, number>)[field]);
        const value = Number.isFinite(raw) ? Math.max(0, raw) : 0;
        if (value > max) {
          max = value;
        }
      }
      acc[field] = max;
      return acc;
    },
    {} as Record<K, number>
  );
};

const getMinByField = <T, K extends keyof T>(items: T[], fields: K[]): Record<K, number> => {
  return fields.reduce(
    (acc, field) => {
      let min = 0;
      for (const item of items) {
        const raw = Number((item as unknown as Record<K, number>)[field]);
        const value = Number.isFinite(raw) ? raw : 0;
        if (value < min) {
          min = value;
        }
      }
      acc[field] = min;
      return acc;
    },
    {} as Record<K, number>
  );
};

const applyScoresInternal = <T extends { score?: number }, K extends keyof T>(
  items: T[],
  fields: K[],
  weights: Record<K, number>
): T[] => {
  if (!items.length) return items;

  const maxByField = getMaxByField(items, fields);
  const minByField = getMinByField(items, fields);
  const fieldCount = fields.length;

  for (const item of items) {
    let total = 0;
    (item as unknown as { scores?: Record<string, number> }).scores = {};

    for (const field of fields) {
      const max = maxByField[field];
      const min = minByField[field];

      const raw = Number((item as unknown as Record<K, number>)[field]);
      const safeRaw = Number.isFinite(raw) ? raw : 0;

      let relative = 0;

      if (field === ("plusMinus" as K)) {
        const range = max - min;
        if (range > 0) {
          relative = ((safeRaw - min) / range) * 100;
        } else {
          continue;
        }
      } else {
        if (max <= 0) continue;
        const value = Math.max(0, safeRaw);
        relative = (value / max) * 100;
      }

      const scoresContainer = (item as unknown as { scores?: Record<string, number> }).scores;
      if (scoresContainer) {
        const clamped = Math.min(Math.max(relative, 0), 100);
        scoresContainer[String(field)] = toTwoDecimals(clamped);
      }

      const weight = weights[field];
      total += relative * weight;
    }

    const average = total / fieldCount;
    item.score = toTwoDecimals(Math.min(Math.max(average, 0), 100));
  }

  return items;
};

export const sortItemsByStatField = (
  data: Player[] | Goalie[],
  kind: "players" | "goalies",
  sortBy?: PlayerFields | GoalieFields
): Player[] | Goalie[] => {
  if (sortBy === "name") {
    return data;
  }

  if (kind === "players") {
    return (data as Player[]).sort((a, b) =>
      sortBy
        ? (b[sortBy as PlayerFields] as number) - (a[sortBy as PlayerFields] as number)
        : defaultSortPlayers(a, b)
    );
  } else if (kind === "goalies") {
    return (data as Goalie[]).sort((a, b) =>
      sortBy
        ? (b[sortBy as GoalieFields] as number) - (a[sortBy as GoalieFields] as number)
        : defaultSortGoalies(a, b)
    );
  } else {
    return data;
  }
};

const applyPlayerScoresByGames = (players: Player[]): void => {
  if (!players.length) return;

  const eligible = players.filter((player) => player.games >= MIN_GAMES_FOR_ADJUSTED_SCORE);

  if (!eligible.length) {
    for (const player of players) {
      player.scoreAdjustedByGames = 0;
    }
    return;
  }

  const fieldCount = PLAYER_SCORE_FIELDS.length;
  const maxPerGameByField = PLAYER_SCORE_FIELDS.reduce(
    (acc, field) => {
      acc[field as PlayerFields] = 0;
      return acc;
    },
    {} as Record<PlayerFields, number>
  );

  let minPlusMinusPerGame = 0;
  let maxPlusMinusPerGame = 0;

  for (const player of eligible) {
    const games = player.games;

    for (const field of PLAYER_SCORE_FIELDS) {
      const raw = Number((player as unknown as Record<PlayerFields, number>)[field]);
      const perGame = raw / games;

      if (field === "plusMinus") {
        if (perGame > maxPlusMinusPerGame) maxPlusMinusPerGame = perGame;
        if (perGame < minPlusMinusPerGame) minPlusMinusPerGame = perGame;
      } else {
        const value = Math.max(0, perGame);
        if (value > maxPerGameByField[field]) {
          maxPerGameByField[field] = value;
        }
      }
    }
  }

  for (const player of players) {
    if (player.games < MIN_GAMES_FOR_ADJUSTED_SCORE) {
      player.scoreAdjustedByGames = 0;
      continue;
    }

    const games = player.games;
    let total = 0;

    for (const field of PLAYER_SCORE_FIELDS) {
      const raw = Number((player as unknown as Record<PlayerFields, number>)[field]);
      const perGame = raw / games;
      let relative = 0;

      if (field === "plusMinus") {
        const range = maxPlusMinusPerGame - minPlusMinusPerGame;
        if (range > 0) {
          relative = ((perGame - minPlusMinusPerGame) / range) * 100;
        }
      } else {
        const max = maxPerGameByField[field];
        if (max > 0) {
          const value = Math.max(0, perGame);
          relative = (value / max) * 100;
        }
      }

      const weight = PLAYER_SCORE_WEIGHTS[field];
      total += relative * weight;
    }

    const average = total / fieldCount;
    player.scoreAdjustedByGames = toTwoDecimals(Math.min(Math.max(average, 0), 100));
  }
};

export const applyPlayerScores = (players: Player[]): Player[] => {
  applyScoresInternal(players, PLAYER_SCORE_FIELDS, PLAYER_SCORE_WEIGHTS);
  applyPlayerScoresByGames(players);
  return players;
};

export const applyGoalieScores = (goalies: Goalie[]): Goalie[] => {
  if (!goalies.length) return goalies;

  const baseFields: GoalieScoreField[] = GOALIE_SCORE_FIELDS;

  const maxByBase = getMaxByField(goalies, baseFields);

  // Save percentage: higher is better
  let maxSavePercent = 0;
  let minSavePercent = Infinity;
  for (const goalie of goalies) {
    const raw = goalie.savePercent;
    if (!raw) continue;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) continue;
    if (value > maxSavePercent) {
      maxSavePercent = value;
    }
    if (value < minSavePercent) {
      minSavePercent = value;
    }
  }
  const hasSavePercent = Number.isFinite(minSavePercent) && maxSavePercent > 0;

  // Goals against average: lower is better
  let minGaa = Infinity;
  for (const goalie of goalies) {
    const raw = goalie.gaa;
    if (!raw) continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    if (value < minGaa) minGaa = value;
  }
  const hasGaa = Number.isFinite(minGaa) && minGaa > 0;

  for (const goalie of goalies) {
    let total = 0;
    let count = 0;
    (goalie as unknown as { scores?: Record<string, number> }).scores = {};
    for (const field of baseFields) {
      const max = maxByBase[field];
      if (max > 0) {
        const raw = Number((goalie as unknown as Record<string, number>)[field]);
        const value = Math.max(0, raw);
        const relative = (value / max) * 100;
        const weight = GOALIE_SCORE_WEIGHTS[field];

        const scoresContainer = (goalie as unknown as { scores?: Record<string, number> }).scores;
        if (scoresContainer) {
          const clamped = Math.min(Math.max(relative, 0), 100);
          scoresContainer[String(field)] = toTwoDecimals(clamped);
        }

        total += relative * weight;
        count += 1;
      }
    }

    if (hasSavePercent && goalie.savePercent) {
      const raw = Number(goalie.savePercent);
      if (Number.isFinite(raw) && raw > 0) {
        const best = maxSavePercent;
        const baseline = GOALIE_SAVE_PERCENT_BASELINE;

        let relative = 0;
        if (best > baseline) {
          if (raw <= baseline) {
            relative = 0;
          } else {
            const ratio = (raw - baseline) / (best - baseline);
            relative = Math.min(Math.max(ratio, 0), 1) * 100;
          }
        }
        const weight = GOALIE_SCORE_WEIGHTS.savePercent;
        total += relative * weight;
        count += 1;

        const scoresContainer = (goalie as unknown as { scores?: Record<string, number> }).scores;
        if (scoresContainer) {
          const clamped = Math.min(Math.max(relative, 0), 100);
          scoresContainer.savePercent = toTwoDecimals(clamped);
        }
      }
    }

    if (hasGaa && goalie.gaa) {
      const raw = Number(goalie.gaa);
      if (Number.isFinite(raw)) {
        const best = minGaa;
        const diff = raw - best;

        let relative = 100;
        if (diff > 0 && GOALIE_GAA_MAX_DIFF_RATIO > 0 && best > 0) {
          const ratio = diff / best; // how much worse than best, as a fraction
          relative =
            ratio >= GOALIE_GAA_MAX_DIFF_RATIO ? 0 : (1 - ratio / GOALIE_GAA_MAX_DIFF_RATIO) * 100;
        }

        const weight = GOALIE_SCORE_WEIGHTS.gaa;
        total += relative * weight;
        count += 1;

        const scoresContainer = (goalie as unknown as { scores?: Record<string, number> }).scores;
        if (scoresContainer) {
          const clamped = Math.min(Math.max(relative, 0), 100);
          scoresContainer.gaa = toTwoDecimals(clamped);
        }
      }
    }

    if (count === 0) {
      goalie.score = 0;
      continue;
    }

    const average = total / count;
    goalie.score = toTwoDecimals(Math.min(Math.max(average, 0), 100));
  }
  const eligible = goalies.filter((goalie) => goalie.games >= MIN_GAMES_FOR_ADJUSTED_SCORE);

  if (!eligible.length) {
    for (const goalie of goalies) {
      goalie.scoreAdjustedByGames = 0;
    }
    return goalies;
  }

  const fieldCount = baseFields.length;
  const maxPerGameByField = baseFields.reduce(
    (acc, field) => {
      acc[field] = 0;
      return acc;
    },
    {} as Record<GoalieScoreField, number>
  );

  for (const goalie of eligible) {
    const games = goalie.games;
    for (const field of baseFields) {
      const raw = Number((goalie as unknown as Record<GoalieScoreField, number>)[field]);
      const perGame = raw / games;
      const value = Math.max(0, perGame);
      if (value > maxPerGameByField[field]) {
        maxPerGameByField[field] = value;
      }
    }
  }

  for (const goalie of goalies) {
    if (goalie.games < MIN_GAMES_FOR_ADJUSTED_SCORE) {
      goalie.scoreAdjustedByGames = 0;
      continue;
    }

    const games = goalie.games;
    let total = 0;

    for (const field of baseFields) {
      const max = maxPerGameByField[field];
      if (max > 0) {
        const raw = Number((goalie as unknown as Record<GoalieScoreField, number>)[field]);
        const perGame = raw / games;
        const value = Math.max(0, perGame);
        const relative = (value / max) * 100;
        const weight = GOALIE_SCORE_WEIGHTS[field];
        total += relative * weight;
      }
    }

    const average = total / fieldCount;
    goalie.scoreAdjustedByGames = toTwoDecimals(Math.min(Math.max(average, 0), 100));
  }

  return goalies;
};

export const availableSeasons = (): number[] =>
  Array.from({ length: seasonsTotal.length }, (_, i) => i + START_SEASON);

export const seasonAvailable = (season?: number) => !!season && availableSeasons().includes(season);

export const reportTypeAvailable = (report?: Report) => !!report && REPORT_TYPES.includes(report);

export const parseSeasonParam = (value: unknown): number | undefined => {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};
