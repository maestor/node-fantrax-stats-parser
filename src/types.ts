interface Common {
  id: string;
  name: string;
  position?: string;
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
  scoreByPosition?: number;
  scoreByPositionAdjustedByGames?: number;
  scoresByPosition?: Record<string, number>;
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

export type CountSplit = {
  owned: number;
  played: number;
};

export type CareerSummaryTeam = {
  teamId: string;
  teamName: string;
  seasonCount: CountSplit;
  firstSeason: number;
  lastSeason: number;
};

export type CareerSummary = {
  firstSeason: number;
  lastSeason: number;
  seasonCount: CountSplit;
  teamCount: CountSplit;
  teams: CareerSummaryTeam[];
};

export type CareerPlayerSeasonRow = {
  season: number;
  reportType: CsvReport;
  teamId: string;
  teamName: string;
  position?: string;
  games: number;
  goals: number;
  assists: number;
  points: number;
  plusMinus: number;
  penalties: number;
  shots: number;
  ppp: number;
  shp: number;
  hits: number;
  blocks: number;
};

export type CareerGoalieSeasonRow = {
  season: number;
  reportType: CsvReport;
  teamId: string;
  teamName: string;
  games: number;
  wins: number;
  saves: number;
  shutouts: number;
  goals: number;
  assists: number;
  points: number;
  penalties: number;
  ppp: number;
  shp: number;
  gaa?: string;
  savePercent?: string;
};

export type CareerPlayerTeamTotals = {
  teamId: string;
  teamName: string;
  seasonCount: CountSplit;
  games: number;
  goals: number;
  assists: number;
  points: number;
  plusMinus: number;
  penalties: number;
  shots: number;
  ppp: number;
  shp: number;
  hits: number;
  blocks: number;
};

export type CareerGoalieTeamTotals = {
  teamId: string;
  teamName: string;
  seasonCount: CountSplit;
  games: number;
  wins: number;
  saves: number;
  shutouts: number;
  goals: number;
  assists: number;
  points: number;
  penalties: number;
  ppp: number;
  shp: number;
};

export type CareerPlayerTotals = {
  seasonCount: CountSplit;
  teamCount: CountSplit;
  teams: CareerPlayerTeamTotals[];
  games: number;
  goals: number;
  assists: number;
  points: number;
  plusMinus: number;
  penalties: number;
  shots: number;
  ppp: number;
  shp: number;
  hits: number;
  blocks: number;
};

export type CareerGoalieTotals = {
  seasonCount: CountSplit;
  teamCount: CountSplit;
  teams: CareerGoalieTeamTotals[];
  games: number;
  wins: number;
  saves: number;
  shutouts: number;
  goals: number;
  assists: number;
  points: number;
  penalties: number;
  ppp: number;
  shp: number;
};

export type CareerPlayerResponse = {
  id: string;
  name: string;
  position?: string;
  summary: CareerSummary;
  totals: {
    career: CareerPlayerTotals;
    regular: CareerPlayerTotals;
    playoffs: CareerPlayerTotals;
  };
  seasons: CareerPlayerSeasonRow[];
};

export type CareerGoalieResponse = {
  id: string;
  name: string;
  summary: CareerSummary;
  totals: {
    career: CareerGoalieTotals;
    regular: CareerGoalieTotals;
    playoffs: CareerGoalieTotals;
  };
  seasons: CareerGoalieSeasonRow[];
};

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
  field20?: string;
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

export type CsvReport = "regular" | "playoffs";

// API-level reportType. `both` is virtual and represents regular+playoffs merged.
export type Report = CsvReport | "both";

export type QueryParams = {
  reportType: Report;
  season?: number;
  startFrom?: number;
};

export type Team = {
  id: string;
  name: string;
  presentName: string;
  nameAliases?: string[];
  // First season year in the YYYY-YYYY+1 format used by imports (e.g. 2017 => 2017-2018).
  // Useful for expansion/relocation where a team doesn't exist in older seasons.
  firstSeason?: number;
};

export type PlayoffLeaderboardEntry = {
  teamId: string;
  teamName: string;
  appearances: number;
  championships: number;
  finals: number;
  conferenceFinals: number;
  secondRound: number;
  firstRound: number;
  seasons: PlayoffLeaderboardSeason[];
  tieRank: boolean;
};

export type RegularLeaderboardSeason = {
  season: number;
  regularTrophy: boolean;
  wins: number;
  losses: number;
  ties: number;
  points: number;
  divWins: number;
  divLosses: number;
  divTies: number;
  winPercent: number;
  divWinPercent: number;
  pointsPercent: number;
};

export type PlayoffRoundKey =
  | "championship"
  | "final"
  | "conferenceFinal"
  | "secondRound"
  | "firstRound"
  | "notQualified";

export type PlayoffLeaderboardSeason = {
  season: number;
  round: number;
  key: PlayoffRoundKey;
};

export type RegularLeaderboardEntry = {
  teamId: string;
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
  points: number;
  divWins: number;
  divLosses: number;
  divTies: number;
  winPercent: number;
  divWinPercent: number;
  pointsPercent: number;
  regularTrophies: number;
  seasons: RegularLeaderboardSeason[];
  tieRank: boolean;
};
