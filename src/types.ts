interface Common {
  name: string;
  games: number;
  goals: number;
  assists: number;
  points: number;
  penalties: number;
  ppp: number;
  shp: number;
  score: number;
  scoreAdjustedByGames: number;
  scores?: Record<string, number>;
}

export interface Player extends Common {
  plusMinus: number;
  shots: number;
  hits: number;
  blocks: number;
}

export interface Goalie extends Common {
  wins: number;
  saves: number;
  shutouts: number;
  gaa?: string;
  savePercent?: string;
}

export interface PlayerWithSeason extends Player {
  season: number;
}

// Single-season snapshot used inside CombinedPlayer.seasons.
// Includes per-season score, scoreAdjustedByGames and scores, but omits name
// (name is available at the CombinedPlayer root level).
export type PlayerSeasonData = Omit<PlayerWithSeason, "name">;

export interface CombinedPlayer extends Player {
  seasons: PlayerSeasonData[];
}

export interface GoalieWithSeason extends Goalie {
  season: number;
}

// Single-season snapshot used inside CombinedGoalie.seasons.
// Includes per-season score, scoreAdjustedByGames and scores, but omits name
// (name is available at the CombinedGoalie root level).
export type GoalieSeasonData = Omit<GoalieWithSeason, "name">;

export interface CombinedGoalie extends Goalie {
  seasons: GoalieSeasonData[];
}

export type PlayerFields =
  | "name"
  | "games"
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

export type GoalieFields =
  | "name"
  | "games"
  | "wins"
  | "saves"
  | "shutouts"
  | "goals"
  | "assists"
  | "points"
  | "penalties"
  | "ppp"
  | "shp";

export interface RawData {
  Skaters: string;
  season: number;
  field2: string;
  field3: string;
  field4: string;
  field5: string;
  field6: string;
  field7: string;
  field8: string;
  field9: string;
  field10: string;
  field11: string;
  field12: string;
  field13: string;
  field14: string;
  field15: string;
  field16: string;
  field17: string;
  field18: string;
  field19?: string;
}

export type PlayerScoreField =
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

export type GoalieScoreField = "wins" | "saves" | "shutouts";

export type GoalieOptionalScoreField = "gaa" | "savePercent";

export type PlayerScoreWeights = Record<PlayerScoreField, number>;
export type GoalieScoreWeights = Record<GoalieScoreField | GoalieOptionalScoreField, number>;

export type Report = "regular" | "playoffs";

export type QueryParams = {
  reportType: Report;
  sortBy?: PlayerFields | GoalieFields;
  season?: number;
};

export type Team = {
  id: string;
  name: string;
  presentName: string;
  nameAliases?: string[];
};

export type League = {
  year: number;
  leagueId: string;
  endDate: string;
};
