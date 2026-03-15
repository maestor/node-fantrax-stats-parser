import type { Goalie, GoalieScoreField, Player } from "./types";
import {
  GOALIE_ADJUSTED_SCORE_PRIOR_GAMES,
  GOALIE_GAA_MAX_DIFF_RATIO,
  GOALIE_SAVE_PERCENT_BASELINE,
  GOALIE_SCORE_FIELDS,
  GOALIE_SCORE_WEIGHTS,
  GOALIE_SCORING_DAMPENING_EXPONENT,
  MIN_GAMES_FOR_ADJUSTED_SCORE,
  PLAYER_ADJUSTED_SCORE_PRIOR_GAMES,
  PLAYER_SCORE_FIELDS,
  PLAYER_SCORE_WEIGHTS,
} from "../../config/settings";

const defaultSortPlayers = (a: Player, b: Player): number =>
  b.score - a.score || b.points - a.points || b.goals - a.goals;

const defaultSortGoalies = (a: Goalie, b: Goalie): number =>
  b.score - a.score || b.wins - a.wins || b.games - a.games;

const toTwoDecimals = (value: number): number => Number(value.toFixed(2));

// Normalize a numeric field so that the highest positive value becomes 100
// and all other positive values are scaled proportionally into the 0-100 range.
// Used for both total scores (score) and games-adjusted scores (scoreAdjustedByGames).
const normalizeFieldToBest = <T, K extends keyof T & string>(
  items: T[],
  field: K,
): void => {
  let max = 0;

  for (const item of items as Array<Record<string, unknown>>) {
    const current = item[field];
    if (typeof current === "number" && current > max) {
      max = current;
    }
  }

  if (max <= 0) return;

  for (const item of items as Array<Record<string, unknown>>) {
    const current = item[field];
    if (typeof current === "number" && current > 0) {
      const normalized = (current / max) * 100;
      item[field] = toTwoDecimals(Math.min(Math.max(normalized, 0), 100));
    }
  }
};

const getMaxByField = <T extends Record<K, number>, K extends keyof T>(
  items: readonly T[],
  fields: readonly K[],
): Record<K, number> => {
  return fields.reduce(
    (acc, field) => {
      let max = 0;
      for (const item of items) {
        const raw = Number(item[field]);
        const value = Number.isFinite(raw) ? Math.max(0, raw) : 0;
        if (value > max) {
          max = value;
        }
      }
      acc[field] = max;
      return acc;
    },
    {} as Record<K, number>,
  );
};

const getMinByField = <T extends Record<K, number>, K extends keyof T>(
  items: readonly T[],
  fields: readonly K[],
): Record<K, number> => {
  return fields.reduce(
    (acc, field) => {
      let min = 0;
      for (const item of items) {
        const raw = Number(item[field]);
        const value = Number.isFinite(raw) ? raw : 0;
        if (value < min) {
          min = value;
        }
      }
      acc[field] = min;
      return acc;
    },
    {} as Record<K, number>,
  );
};

const applyScoresInternal = <
  T extends Record<K, number> & {
    score?: number;
    scores?: Record<string, number>;
  },
  K extends keyof T & string,
>(
  items: T[],
  fields: K[],
  weights: Record<K, number>,
): number[] => {
  if (!items.length) return [];

  const maxByField = getMaxByField(items, fields);
  const minByField = getMinByField(items, fields);
  const fieldCount = fields.length;
  const rawScores: number[] = [];

  for (const item of items) {
    let total = 0;
    item.scores = {};

    for (const field of fields) {
      const max = maxByField[field];
      const min = minByField[field];

      const raw = Number(item[field]);
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

      item.scores[field] = toTwoDecimals(Math.min(Math.max(relative, 0), 100));

      const weight = weights[field];
      total += relative * weight;
    }

    const average = total / fieldCount;
    item.score = toTwoDecimals(Math.min(Math.max(average, 0), 100));
    rawScores.push(item.score);
  }

  normalizeFieldToBest(items, "score");
  return rawScores;
};

const getStabilizedRate = (
  value: number,
  games: number,
  priorRate: number,
  priorGames: number,
): number => {
  return (value + priorRate * priorGames) / (games + priorGames);
};

const getAdjustedObservedRate = (
  value: number,
  games: number,
  priorRate: number,
  priorGames: number,
): number => {
  if (value === 0) return 0;
  return getStabilizedRate(value, games, priorRate, priorGames);
};

const getPriorRatesByField = <
  T extends { games: number } & Record<K, number>,
  K extends keyof T & string,
>(
  items: readonly T[],
  fields: readonly K[],
  negativeField?: K,
): Record<K, number> => {
  const totals = fields.reduce(
    (acc, field) => {
      acc[field] = 0;
      return acc;
    },
    {} as Record<K, number>,
  );
  let totalGames = 0;

  for (const item of items) {
    const games = item.games;
    totalGames += games;

    for (const field of fields) {
      const raw = Number(item[field]);
      const safeRaw = Number.isFinite(raw) ? raw : 0;
      totals[field] +=
        field === negativeField ? safeRaw : Math.max(0, safeRaw);
    }
  }

  return fields.reduce(
    (acc, field) => {
      acc[field] = totals[field] / totalGames;
      return acc;
    },
    {} as Record<K, number>,
  );
};

const getStabilizedRateBounds = <
  T extends { games: number } & Record<K, number>,
  K extends keyof T & string,
>(
  items: readonly T[],
  fields: readonly K[],
  priorRates: Record<K, number>,
  priorGamesByField: Record<K, number>,
  negativeField?: K,
): { maxByField: Record<K, number>; minByField: Record<K, number> } => {
  const maxByField = fields.reduce(
    (acc, field) => {
      acc[field] = 0;
      return acc;
    },
    {} as Record<K, number>,
  );
  const minByField = fields.reduce(
    (acc, field) => {
      acc[field] = 0;
      return acc;
    },
    {} as Record<K, number>,
  );

  for (const item of items) {
    const games = item.games;

    for (const field of fields) {
      const raw = Number(item[field]);
      const safeRaw = Number.isFinite(raw) ? raw : 0;
      const value =
        field === negativeField ? safeRaw : Math.max(0, safeRaw);
      const stabilizedRate = getAdjustedObservedRate(
        value,
        games,
        priorRates[field],
        priorGamesByField[field],
      );

      if (field === negativeField) {
        if (stabilizedRate > maxByField[field]) {
          maxByField[field] = stabilizedRate;
        }
        if (stabilizedRate < minByField[field]) {
          minByField[field] = stabilizedRate;
        }
      } else if (stabilizedRate > maxByField[field]) {
        maxByField[field] = stabilizedRate;
      }
    }
  }

  return { maxByField, minByField };
};

const applyStabilizedAdjustedScores = <
  T extends { games: number } & Record<K, number> & Partial<Record<S, number>>,
  K extends keyof T & string,
  S extends keyof T & string,
>(
  items: T[],
  fields: readonly K[],
  weights: Record<K, number>,
  priorGamesByField: Record<K, number>,
  outputField: S,
  negativeField?: K,
): void => {
  if (!items.length) return;

  const eligible = items.filter(
    (item) => item.games >= MIN_GAMES_FOR_ADJUSTED_SCORE,
  );

  if (!eligible.length) {
    for (const item of items) {
      item[outputField] = 0 as T[S];
    }
    return;
  }

  const priorRates = getPriorRatesByField(eligible, fields, negativeField);
  const { maxByField, minByField } = getStabilizedRateBounds(
    eligible,
    fields,
    priorRates,
    priorGamesByField,
    negativeField,
  );
  const fieldCount = fields.length;

  for (const item of items) {
    if (item.games < MIN_GAMES_FOR_ADJUSTED_SCORE) {
      item[outputField] = 0 as T[S];
      continue;
    }

    const games = item.games;
    let total = 0;

    for (const field of fields) {
      const raw = Number(item[field]);
      const safeRaw = Number.isFinite(raw) ? raw : 0;
      const value =
        field === negativeField ? safeRaw : Math.max(0, safeRaw);
      const stabilizedRate = getAdjustedObservedRate(
        value,
        games,
        priorRates[field],
        priorGamesByField[field],
      );

      let relative = 0;

      if (field === negativeField) {
        const range = maxByField[field] - minByField[field];
        if (range > 0) {
          relative = ((stabilizedRate - minByField[field]) / range) * 100;
        }
      } else {
        const max = maxByField[field];
        if (max > 0) {
          relative = (Math.max(0, stabilizedRate) / max) * 100;
        }
      }

      total += relative * weights[field];
    }

    item[outputField] = toTwoDecimals(
      Math.min(Math.max(total / fieldCount, 0), 100),
    ) as T[S];
  }

  normalizeFieldToBest(items, outputField);
};

export const sortItemsByStatField = (
  data: Player[] | Goalie[],
  kind: "players" | "goalies",
): Player[] | Goalie[] => {
  if (kind === "players") {
    return (data as Player[]).sort(defaultSortPlayers);
  } else if (kind === "goalies") {
    return (data as Goalie[]).sort(defaultSortGoalies);
  }
  return data;
};

const applyPlayerScoresByGames = (players: Player[]): void => {
  applyStabilizedAdjustedScores(
    players,
    PLAYER_SCORE_FIELDS,
    PLAYER_SCORE_WEIGHTS,
    PLAYER_ADJUSTED_SCORE_PRIOR_GAMES,
    "scoreAdjustedByGames",
    "plusMinus",
  );
};

export const applyPlayerScores = (players: Player[]): Player[] => {
  applyScoresInternal(players, PLAYER_SCORE_FIELDS, PLAYER_SCORE_WEIGHTS);
  applyPlayerScoresByGames(players);
  return players;
};

const applyPositionScoresForGroup = (players: Player[]): void => {
  if (!players.length) return;

  const fields = PLAYER_SCORE_FIELDS;
  const weights = PLAYER_SCORE_WEIGHTS;
  const fieldCount = fields.length;

  // Calculate max/min for the position group
  const maxByField = getMaxByField(players, fields);
  const minByField = getMinByField(players, fields);

  // Calculate scoreByPosition and scoresByPosition
  for (const player of players) {
    let total = 0;
    player.scoresByPosition = {};

    for (const field of fields) {
      const max = maxByField[field];
      const min = minByField[field];

      const raw = Number(player[field]);
      const safeRaw = Number.isFinite(raw) ? raw : 0;

      let relative = 0;

      if (field === "plusMinus") {
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

      const clamped = Math.min(Math.max(relative, 0), 100);
      player.scoresByPosition[field] = toTwoDecimals(clamped);

      const weight = weights[field];
      total += relative * weight;
    }

    const average = total / fieldCount;
    player.scoreByPosition = toTwoDecimals(Math.min(Math.max(average, 0), 100));
  }

  normalizeFieldToBest(players, "scoreByPosition");
  applyStabilizedAdjustedScores(
    players,
    fields,
    weights,
    PLAYER_ADJUSTED_SCORE_PRIOR_GAMES,
    "scoreByPositionAdjustedByGames",
    "plusMinus",
  );
};

export const applyPlayerScoresByPosition = (players: Player[]): Player[] => {
  if (!players.length) return players;

  // Group players by position
  const forwards = players.filter((player) => player.position === "F");
  const defensemen = players.filter((player) => player.position === "D");

  // Apply position-based scoring to each group
  applyPositionScoresForGroup(forwards);
  applyPositionScoresForGroup(defensemen);

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
    goalie.scores = {};
    for (const field of baseFields) {
      const max = maxByBase[field];
      if (max > 0) {
        const raw = Number(goalie[field]);
        const value = Math.max(0, raw);
        const relative =
          Math.pow(value / max, GOALIE_SCORING_DAMPENING_EXPONENT) * 100;
        const weight = GOALIE_SCORE_WEIGHTS[field];

        goalie.scores[field] = toTwoDecimals(
          Math.min(Math.max(relative, 0), 100),
        );

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

        goalie.scores.savePercent = toTwoDecimals(
          Math.min(Math.max(relative, 0), 100),
        );
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
            ratio >= GOALIE_GAA_MAX_DIFF_RATIO
              ? 0
              : (1 - ratio / GOALIE_GAA_MAX_DIFF_RATIO) * 100;
        }

        const weight = GOALIE_SCORE_WEIGHTS.gaa;
        total += relative * weight;
        count += 1;

        goalie.scores.gaa = toTwoDecimals(
          Math.min(Math.max(relative, 0), 100),
        );
      }
    }

    if (count === 0) {
      goalie.score = 0;
      continue;
    }

    const average = total / count;
    goalie.score = toTwoDecimals(Math.min(Math.max(average, 0), 100));
  }

  normalizeFieldToBest(goalies, "score");
  applyStabilizedAdjustedScores(
    goalies,
    baseFields,
    GOALIE_SCORE_WEIGHTS,
    GOALIE_ADJUSTED_SCORE_PRIOR_GAMES,
    "scoreAdjustedByGames",
  );

  return goalies;
};
