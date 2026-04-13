import { PLAYER_SCORE_FIELDS } from "../../config/index.js";
import type {
  GoalieOptionalScoreField,
  GoalieScoreField,
  PlayerScoreField,
} from "../stats/types.js";

export type FinalsStatKey =
  | PlayerScoreField
  | GoalieScoreField
  | GoalieOptionalScoreField;

export type FinalsModelWeights = Record<FinalsStatKey, number>;

export const FINALS_STAT_KEYS = [
  ...PLAYER_SCORE_FIELDS,
  "wins",
  "gaa",
  "saves",
  "savePercent",
  "shutouts",
] as const satisfies readonly FinalsStatKey[];

export type FinalsTeamScore = {
  matchPoints: number;
  categoriesWon: number;
  categoriesLost: number;
  categoriesTied: number;
};

export type FinalsPlayedGames = {
  total: number;
  skaters: number;
  goalies: number;
};

export type FinalsTeamTotals = Record<
  PlayerScoreField | GoalieScoreField,
  number
> & {
  gaa: number | null;
  savePercent: number | null;
};

export type FinalsTeamData = {
  teamId: string;
  isWinner: boolean;
  score: FinalsTeamScore;
  playedGames: FinalsPlayedGames;
  totals: FinalsTeamTotals;
};

export type FinalsTeam = Omit<FinalsTeamData, "isWinner"> & {
  teamName: string;
  teamAbbr: string;
};

export type FinalsCategory = {
  statKey: FinalsStatKey;
  awayValue: number | null;
  homeValue: number | null;
  winnerTeamId: string | null;
};

export type FinalsRates = {
  winRate: number;
  deservedToWinRate: number;
};

export type FinalsFactorSet = {
  offence: number;
  physical: number;
  goalies: number;
};

export type FinalsFactors = {
  awayTeam: FinalsFactorSet;
  homeTeam: FinalsFactorSet;
};

export type FinalsMatchupDbEntry = {
  season: number;
  wonOnHomeTiebreak: boolean;
  winnerTeamId: string;
  awayTeam: FinalsTeamData;
  homeTeam: FinalsTeamData;
};

export type FinalsCategoryDbEntry = {
  season: number;
  statKey: FinalsStatKey;
  awayValue: number | null;
  homeValue: number | null;
  winnerTeamId: string | null;
};

export type FinalsLeaderboardEntry = {
  season: number;
  wonOnHomeTiebreak: boolean;
  winnerTeamId: string;
  winnerTeamName: string;
  awayTeam: FinalsTeam;
  homeTeam: FinalsTeam;
  categories: FinalsCategory[];
  rates: FinalsRates;
  factors: FinalsFactors;
};
