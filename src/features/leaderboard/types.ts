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
};

export type TransactionLeaderboardEntry = {
  teamId: string;
  teamName: string;
  claims: number;
  drops: number;
  trades: number;
  seasons: TransactionLeaderboardSeason[];
  tieRank: boolean;
};
