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

export type TransactionLeaderboardSeason = {
  season: number;
  claims: number;
  drops: number;
  trades: number;
  players: number;
  goalies: number;
};

export type TransactionLeaderboardEntry = {
  teamId: string;
  teamName: string;
  claims: number;
  drops: number;
  trades: number;
  players: number;
  goalies: number;
  seasons: TransactionLeaderboardSeason[];
  tieRank: boolean;
};

export const CATEGORY_KEYS = [
  "goals", "assists", "points", "plusMinus", "penalties", "shots", "ppp", "shp", "hits", "blocks",
  "wins", "saves", "shutouts",
] as const;

export type CategoryKey = (typeof CATEGORY_KEYS)[number];
export type CategoryGroup = "skater" | "goalie";
export type CategoryCoverageStatus = "complete" | "partial" | "unknown";
export type CategoryTeamParticipation = "not-yet-joined" | "reported" | "missing-report" | "unknown";

export type CategoryValue = {
  total: number;
  games: number;
  rate: number | null;
  totalRank: number | null;
  rateRank: number | null;
  totalEligibleTeamCount: number;
  rateEligibleTeamCount: number;
  totalMedian: number | null;
  rateMedian: number | null;
  totalGapToNext: number | null;
  rateGapToNext: number | null;
  previous: {
    total: number;
    games: number;
    rate: number | null;
    totalRank: number | null;
    rateRank: number | null;
    totalEligibleTeamCount: number;
    rateEligibleTeamCount: number;
    totalChange: number | null;
    rateChange: number | null;
    totalRankChange: number | null;
    rateRankChange: number | null;
  } | null;
};

export type CategoryPlayerContribution = {
  id: string;
  name: string;
  position: string | null;
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

export type CategoryGoalieContribution = {
  id: string;
  name: string;
  games: number;
  wins: number;
  saves: number;
  shutouts: number;
};

export type CategoryDashboardTeam = {
  teamId: string;
  teamName: string;
  teamAbbr: string;
  participation: CategoryTeamParticipation;
  skaterGames: number;
  goalieGames: number;
  categories: Record<CategoryKey, CategoryValue>;
  players: CategoryPlayerContribution[];
  goalies: CategoryGoalieContribution[];
};

export type CategoryDashboardResponse = {
  season: number;
  scope: "regular";
  availableSeasons: number[];
  lastModified: string | null;
  seasonHasCreditedGames: boolean;
  coverage: {
    status: CategoryCoverageStatus;
    expectedTeamCount: number;
    participatingTeamCount: number;
    reportedTeamCount: number;
    missingReportTeamIds: string[];
    unknownTeamIds: string[];
  };
  categories: Array<{ key: CategoryKey; group: CategoryGroup; higherIsBetter: true }>;
  teams: CategoryDashboardTeam[];
};
