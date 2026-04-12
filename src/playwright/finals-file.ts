import { GOALIE_SCORE_FIELDS, PLAYER_SCORE_FIELDS } from "../config/index.js";
import type {
  GoalieOptionalScoreField,
  GoalieScoreField,
  PlayerScoreField,
} from "../features/stats/types.js";

export const FINALS_SCHEMA_VERSION = 1;

export type FinalStatKey =
  | PlayerScoreField
  | GoalieScoreField
  | GoalieOptionalScoreField;

export type FinalCountStatKey = Exclude<FinalStatKey, "gaa" | "savePercent">;
export type FinalSide = "away" | "home";
export type FinalCategoryWinner = FinalSide | "tie";

export type FinalTotals = Record<FinalCountStatKey, number> & {
  gaa?: string | null;
  savePercent?: string | null;
};

export type FinalCategoryResultValue = number | string | null;

export type FinalCategoryResult = {
  away: FinalCategoryResultValue;
  home: FinalCategoryResultValue;
  winner: FinalCategoryWinner;
};

export type FinalScore = {
  categoriesWon: number;
  categoriesLost: number;
  categoriesTied: number;
  rotisseriePoints: number;
};

export type FinalPlayedGames = {
  total: number;
  skaters: number;
  goalies: number;
};

export type FinalTeam = {
  teamId: string;
  teamName: string;
  isWinner: boolean;
  score: FinalScore;
  playedGames: FinalPlayedGames;
  totals: FinalTotals;
};

export type FinalSeason = {
  year: number;
  wonOnHomeTiebreak: boolean;
  awayTeam: FinalTeam;
  homeTeam: FinalTeam;
  categoryResults: Record<FinalStatKey, FinalCategoryResult>;
};

export type FinalsFile = {
  schemaVersion: typeof FINALS_SCHEMA_VERSION;
  leagueName: string;
  scrapedAt: string;
  seasons: FinalSeason[];
};

export const FINAL_STAT_KEYS = [
  ...PLAYER_SCORE_FIELDS,
  ...GOALIE_SCORE_FIELDS,
  "gaa",
  "savePercent",
] as const satisfies readonly FinalStatKey[];

export const parseFinalsFile = (
  parsed: unknown,
  sourceName: string,
): FinalsFile => {
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Invalid finals file: ${sourceName}`);
  }

  const file = parsed as Partial<FinalsFile>;
  if (
    file.schemaVersion !== FINALS_SCHEMA_VERSION ||
    typeof file.leagueName !== "string" ||
    typeof file.scrapedAt !== "string" ||
    !Array.isArray(file.seasons)
  ) {
    throw new Error(
      `Unsupported finals file schema in ${sourceName}. Expected schemaVersion ${FINALS_SCHEMA_VERSION}. ` +
        `Re-run npm run playwright:sync:finals to regenerate it.`,
    );
  }

  return parsed as FinalsFile;
};
