import fs from "fs";
import path from "path";
import { Player, PlayerFields, Goalie, Report, CsvReport, GoalieScoreField } from "./types";
import {
  REPORT_TYPES,
  PLAYER_SCORE_FIELDS,
  GOALIE_SCORE_FIELDS,
  PLAYER_SCORE_WEIGHTS,
  GOALIE_SCORE_WEIGHTS,
  GOALIE_GAA_MAX_DIFF_RATIO,
  GOALIE_SAVE_PERCENT_BASELINE,
  GOALIE_SCORING_DAMPENING_EXPONENT,
  MIN_GAMES_FOR_ADJUSTED_SCORE,
  DEFAULT_TEAM_ID,
  TEAMS,
  HTTP_STATUS,
  ERROR_MESSAGES,
} from "./constants";
import { isR2Enabled } from "./storage";
import { getSeasonManifest } from "./storage/manifest";

export { HTTP_STATUS, ERROR_MESSAGES } from "./constants";

export class ApiError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

const helperCaches = {
  teamCsvDirExists: new Map<string, boolean>(),
  seasonsForTeam: new Map<string, number[]>(),
  teamsWithCsvFolders: undefined as Array<(typeof TEAMS)[number]> | undefined,
};

export const resetHelperCachesForTests = (): void => {
  helperCaches.teamCsvDirExists.clear();
  helperCaches.seasonsForTeam.clear();
  helperCaches.teamsWithCsvFolders = undefined;
};

const getTeamCsvDir = (teamId: string): string => path.join(process.cwd(), "csv", teamId);

const hasTeamCsvDir = (teamId: string): boolean => {
  const cached = helperCaches.teamCsvDirExists.get(teamId);
  if (cached !== undefined) return cached;

  if (isR2Enabled()) {
    // For R2, we can't efficiently check directory existence
    // Instead, mark as true and let individual file checks fail gracefully
    helperCaches.teamCsvDirExists.set(teamId, true);
    return true;
  }

  try {
    fs.readdirSync(getTeamCsvDir(teamId));
    helperCaches.teamCsvDirExists.set(teamId, true);
    return true;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err?.code === "ENOENT") {
      helperCaches.teamCsvDirExists.set(teamId, false);
      return false;
    }
    throw error;
  }
};

export const getTeamsWithCsvFolders = (): Array<(typeof TEAMS)[number]> => {
  if (!helperCaches.teamsWithCsvFolders) {
    helperCaches.teamsWithCsvFolders = TEAMS.filter((team) => hasTeamCsvDir(team.id));
  }
  return helperCaches.teamsWithCsvFolders;
};

export const resolveTeamId = (raw: unknown): string => {
  if (typeof raw !== "string") return DEFAULT_TEAM_ID;
  const teamId = raw.trim();
  if (!teamId) return DEFAULT_TEAM_ID;

  return isConfiguredTeamId(teamId) && hasTeamCsvDir(teamId) ? teamId : DEFAULT_TEAM_ID;
};

const isConfiguredTeamId = (teamId: string): boolean => TEAMS.some((t) => t.id === teamId);

const ensureTeamCsvDirOrThrow = (teamId: string): string => {
  const dir = getTeamCsvDir(teamId);
  try {
    fs.readdirSync(dir);
    return dir;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err?.code === "ENOENT" && isConfiguredTeamId(teamId)) {
      throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, ERROR_MESSAGES.TEAM_CSV_FOLDER_MISSING(teamId));
    }
    throw error;
  }
};

export const listSeasonsForTeam = async (teamId: string, reportType: CsvReport): Promise<number[]> => {
  const cacheKey = `${teamId}:${reportType}`;
  const cached = helperCaches.seasonsForTeam.get(cacheKey);
  if (cached !== undefined) return cached;

  if (isR2Enabled()) {
    // For R2: Use manifest file
    const manifest = await getSeasonManifest();
    const seasons = manifest[teamId]?.[reportType] || [];
    helperCaches.seasonsForTeam.set(cacheKey, seasons);
    return seasons;
  }

  // Filesystem mode
  const dir = ensureTeamCsvDirOrThrow(teamId);
  const files = fs.readdirSync(dir);

  const regex = new RegExp(`^${reportType}-(\\d{4})-(\\d{4})\\.csv$`);
  const seasons = new Set<number>();

  for (const file of files) {
    const match = file.match(regex);
    if (!match) continue;
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (end !== start + 1) continue;
    seasons.add(start);
  }

  const result = [...seasons].sort((a, b) => a - b);
  helperCaches.seasonsForTeam.set(cacheKey, result);
  return result;
};

const defaultSortPlayers = (a: Player, b: Player): number =>
  b.score - a.score || b.points - a.points || b.goals - a.goals;

const defaultSortGoalies = (a: Goalie, b: Goalie): number =>
  b.score - a.score || b.wins - a.wins || b.games - a.games;

const toTwoDecimals = (value: number): number => Number(value.toFixed(2));

// Normalize a numeric field so that the highest positive value becomes 100
// and all other positive values are scaled proportionally into the 0–100 range.
// Used for both total scores (score) and games-adjusted scores (scoreAdjustedByGames).
const normalizeFieldToBest = <T, K extends keyof T & string>(items: T[], field: K): void => {
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

  normalizeFieldToBest(items, "score");
  return items;
};

export const sortItemsByStatField = (
  data: Player[] | Goalie[],
  kind: "players" | "goalies"
): Player[] | Goalie[] => {
  if (kind === "players") {
    return (data as Player[]).sort(defaultSortPlayers);
  } else if (kind === "goalies") {
    return (data as Goalie[]).sort(defaultSortGoalies);
  }
  return data;
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

  normalizeFieldToBest(players, "scoreAdjustedByGames");
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

      const raw = Number((player as unknown as Record<typeof field, number>)[field]);
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

  // Calculate scoreByPositionAdjustedByGames
  const eligible = players.filter((p) => p.games >= MIN_GAMES_FOR_ADJUSTED_SCORE);

  if (!eligible.length) {
    for (const player of players) {
      player.scoreByPositionAdjustedByGames = 0;
    }
    return;
  }

  const maxPerGameByField: Record<string, number> = {};
  let minPlusMinusPerGame = 0;
  let maxPlusMinusPerGame = 0;

  for (const field of fields) {
    maxPerGameByField[field] = 0;
  }

  for (const player of eligible) {
    const games = player.games;
    for (const field of fields) {
      const raw = Number((player as unknown as Record<typeof field, number>)[field]);
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
      player.scoreByPositionAdjustedByGames = 0;
      continue;
    }

    const games = player.games;
    let total = 0;

    for (const field of fields) {
      const raw = Number((player as unknown as Record<typeof field, number>)[field]);
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

      const weight = weights[field];
      total += relative * weight;
    }

    const average = total / fieldCount;
    player.scoreByPositionAdjustedByGames = toTwoDecimals(Math.min(Math.max(average, 0), 100));
  }

  normalizeFieldToBest(players, "scoreByPositionAdjustedByGames");
};

export const applyPlayerScoresByPosition = (players: Player[]): Player[] => {
  if (!players.length) return players;

  // Group players by position
  const forwards = players.filter((p) => p.position === "F");
  const defensemen = players.filter((p) => p.position === "D");

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
    (goalie as unknown as { scores?: Record<string, number> }).scores = {};
    for (const field of baseFields) {
      const max = maxByBase[field];
      if (max > 0) {
        const raw = Number((goalie as unknown as Record<string, number>)[field]);
        const value = Math.max(0, raw);
        const relative = Math.pow(value / max, GOALIE_SCORING_DAMPENING_EXPONENT) * 100;
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

  normalizeFieldToBest(goalies, "score");
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

  normalizeFieldToBest(goalies, "scoreAdjustedByGames");

  return goalies;
};

export const availableSeasons = async (
  teamId: string = DEFAULT_TEAM_ID,
  reportType: Report = "regular"
): Promise<number[]> => {
  if (reportType === "both") {
    const seasons = new Set<number>();
    for (const report of ["regular", "playoffs"] as const) {
      for (const season of await listSeasonsForTeam(teamId, report)) {
        seasons.add(season);
      }
    }
    return [...seasons].sort((a, b) => a - b);
  }

  return await listSeasonsForTeam(teamId, reportType);
};

export const seasonAvailable = async (
  season: number | undefined,
  teamId: string = DEFAULT_TEAM_ID,
  reportType: Report = "regular"
): Promise<boolean> => {
  if (season === undefined) return true;
  return (await availableSeasons(teamId, reportType)).includes(season);
};

export const reportTypeAvailable = (report?: Report) => !!report && REPORT_TYPES.includes(report);

export const parseSeasonParam = (value: unknown): number | undefined => {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};
