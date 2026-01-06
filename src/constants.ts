import {
  Report,
  PlayerScoreField,
  GoalieScoreField,
  PlayerScoreWeights,
  GoalieScoreWeights,
} from "./types";

export const START_SEASON = 2012;

export const GOALIE_SCHEMA_CHANGE_YEAR = 2013;

export const REPORT_TYPES: Report[] = ["playoffs", "regular"];

export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export const ERROR_MESSAGES = {
  INVALID_REPORT_TYPE: "Invalid report type",
  SEASON_NOT_AVAILABLE: "Stats for given season are not available",
};

// CSV field mapping constants
export const CSV = {
  NAME: "field2" as const,
  SKATER_TYPE: "Skaters" as const,
  // Player fields
  PLAYER_GAMES: "field7" as const,
  PLAYER_GOALS: "field8" as const,
  PLAYER_ASSISTS: "field9" as const,
  PLAYER_POINTS: "field10" as const,
  PLAYER_PLUS_MINUS: "field11" as const,
  PLAYER_PENALTIES: "field12" as const,
  PLAYER_SHOTS: "field13" as const,
  PLAYER_PPP: "field14" as const,
  PLAYER_SHP: "field15" as const,
  PLAYER_HITS: "field16" as const,
  PLAYER_BLOCKS: "field17" as const,
  // Goalie fields (note: wins/games swap based on year)
  GOALIE_WINS_OR_GAMES_OLD: "field7" as const,
  GOALIE_GAMES_OR_WINS_OLD: "field8" as const,
  GOALIE_GAA: "field9" as const,
  GOALIE_SAVES: "field10" as const,
  GOALIE_SAVE_PERCENT: "field11" as const,
  GOALIE_SHUTOUTS: "field12" as const,
  GOALIE_PENALTIES: "field13" as const,
  GOALIE_GOALS: "field14" as const,
  GOALIE_ASSISTS: "field15" as const,
  GOALIE_POINTS: "field16" as const,
  GOALIE_PPP: "field17" as const,
  GOALIE_SHP: "field18" as const,
} as const;

export const PLAYER_SCORE_FIELDS: PlayerScoreField[] = [
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

export const GOALIE_SCORE_FIELDS: GoalieScoreField[] = [
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

// Weights for score calculation (banger-leaning league). Adjust these values (0-1) to change weighting.
export const PLAYER_SCORE_WEIGHTS: PlayerScoreWeights = {
  goals: 1,
  assists: 1,
  points: 1,
  plusMinus: 1,
  penalties: 1,
  shots: 1,
  ppp: 1,
  shp: 1,
  hits: 1,
  blocks: 1,
};

export const GOALIE_SCORE_WEIGHTS: GoalieScoreWeights = {
  wins: 1,
  saves: 1,
  shutouts: 1,
  goals: 0.1,
  assists: 0.3,
  points: 0.3,
  penalties: 0.3,
  ppp: 0.3,
  shp: 0.3,
  gaa: 1,
  savePercent: 1,
};
