import fs from "fs";
import { Player, PlayerFields, Goalie, GoalieFields, Report } from "./types";
import { REPORT_TYPES, START_SEASON } from "./constants";

export { HTTP_STATUS, ERROR_MESSAGES } from "./constants";

// Check how many regular season files we have
const seasonsTotal = fs.readdirSync("./csv").filter((file) => file.includes("regular"));

const defaultSortPlayers = (a: Player, b: Player): number =>
  b.score - a.score || b.points - a.points || b.goals - a.goals;

const defaultSortGoalies = (a: Goalie, b: Goalie): number =>
  b.score - a.score || b.wins - a.wins || b.games - a.games;

type PlayerScoreField =
  | "goals"
  | "assists"
  | "points"
  | "plusMinus"
  | "penalties"
  | "shots"
  | "ppp"
  | "shp"
  | "hits"
  | "blocks";

type GoalieScoreField =
  | "wins"
  | "saves"
  | "shutouts"
  | "goals"
  | "assists"
  | "points"
  | "penalties"
  | "ppp"
  | "shp";

type GoalieOptionalScoreField = "gaa" | "savePercent";

const PLAYER_SCORE_FIELDS: PlayerScoreField[] = [
  "goals",
  "assists",
  "points",
  "plusMinus",
  "penalties",
  "shots",
  "ppp",
  "shp",
  "hits",
  "blocks",
];

const GOALIE_SCORE_FIELDS: GoalieScoreField[] = [
  "wins",
  "saves",
  "shutouts",
  "goals",
  "assists",
  "points",
  "penalties",
  "ppp",
  "shp",
];

type PlayerScoreWeights = Record<PlayerScoreField, number>;
type GoalieScoreWeights = Record<GoalieScoreField | GoalieOptionalScoreField, number>;

// Default weights: all fields contribute equally. Adjust these values (0-1) to change weighting.
const PLAYER_SCORE_WEIGHTS: PlayerScoreWeights = {
  goals: 1,
  assists: 1,
  points: 1,
  plusMinus: 0.8,
  penalties: 1,
  shots: 1,
  ppp: 1,
  shp: 0.5,
  hits: 1,
  blocks: 1,
};

const GOALIE_SCORE_WEIGHTS: GoalieScoreWeights = {
  wins: 1,
  saves: 1,
  shutouts: 0.8,
  goals: 0.5,
  assists: 0.5,
  points: 0.5,
  penalties: 0.8,
  ppp: 0.6,
  shp: 0.5,
  gaa: 1,
  savePercent: 1,
};

const toTwoDecimals = (value: number): number => Number(value.toFixed(2));

const getMaxByField = <T, K extends keyof T>(items: T[], fields: K[]): Record<K, number> => {
  return fields.reduce(
    (acc, field) => {
      let max = 0;
      for (const item of items) {
        const raw = Number((item as unknown as Record<K, number>)[field] ?? 0);
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
        const raw = Number((item as unknown as Record<K, number>)[field] ?? 0);
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
  const fieldCount = fields.length || 1;

  for (const item of items) {
    let total = 0;

    for (const field of fields) {
      const max = maxByField[field];
      const min = minByField[field];

      const raw = Number((item as unknown as Record<K, number>)[field] ?? 0);
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

export const applyPlayerScores = (players: Player[]): Player[] =>
  applyScoresInternal(players, PLAYER_SCORE_FIELDS, PLAYER_SCORE_WEIGHTS);

export const applyGoalieScores = (goalies: Goalie[]): Goalie[] => {
  if (!goalies.length) return goalies;

  const baseFields: GoalieScoreField[] = GOALIE_SCORE_FIELDS;

  const maxByBase = getMaxByField(goalies, baseFields);

  // Save percentage: higher is better
  let maxSavePercent = 0;
  for (const goalie of goalies) {
    const raw = goalie.savePercent;
    if (!raw) continue;
    const value = Number(raw);
    if (Number.isFinite(value) && value > maxSavePercent) {
      maxSavePercent = value;
    }
  }

  // Goals against average: lower is better
  let minGaa = Infinity;
  let maxGaa = -Infinity;
  for (const goalie of goalies) {
    const raw = goalie.gaa;
    if (!raw) continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    if (value < minGaa) minGaa = value;
    if (value > maxGaa) maxGaa = value;
  }

  const hasGaaRange = Number.isFinite(minGaa) && Number.isFinite(maxGaa) && maxGaa > minGaa;

  for (const goalie of goalies) {
    let total = 0;
    let count = 0;

    // Base numeric fields where higher is better
    for (const field of baseFields) {
      const max = maxByBase[field];
      if (max <= 0) continue;

      const raw = Number((goalie as unknown as Record<string, number>)[field] ?? 0);
      const value = Number.isFinite(raw) ? Math.max(0, raw) : 0;
      const relative = (value / max) * 100;
      const weight = GOALIE_SCORE_WEIGHTS[field];

      total += relative * weight;
      count += 1;
    }

    // Save percentage (".917" -> 0.917, higher is better)
    if (maxSavePercent > 0 && goalie.savePercent) {
      const raw = Number(goalie.savePercent);
      if (Number.isFinite(raw) && raw > 0) {
        const relative = (raw / maxSavePercent) * 100;
        const weight = GOALIE_SCORE_WEIGHTS.savePercent;
        total += relative * weight;
        count += 1;
      }
    }

    // Goals against average (lower is better)
    if (hasGaaRange && goalie.gaa) {
      const raw = Number(goalie.gaa);
      if (Number.isFinite(raw)) {
        const range = maxGaa - minGaa;
        if (range > 0) {
          const relative = ((maxGaa - raw) / range) * 100;
          const weight = GOALIE_SCORE_WEIGHTS.gaa;
          total += relative * weight;
          count += 1;
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
