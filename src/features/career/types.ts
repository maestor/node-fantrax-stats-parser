import type { CsvReport } from "../../shared/types/core.js";

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
  position: string;
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
  position: string;
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

export type CareerPlayerListItem = {
  id: string;
  name: string;
  position: string;
  firstSeason: number;
  lastSeason: number;
  seasonsOwned: number;
  seasonsPlayedRegular: number;
  seasonsPlayedPlayoffs: number;
  teamsOwned: number;
  teamsPlayedRegular: number;
  teamsPlayedPlayoffs: number;
  regularGames: number;
  playoffGames: number;
};

export type CareerGoalieListItem = {
  id: string;
  name: string;
  firstSeason: number;
  lastSeason: number;
  seasonsOwned: number;
  seasonsPlayedRegular: number;
  seasonsPlayedPlayoffs: number;
  teamsOwned: number;
  teamsPlayedRegular: number;
  teamsPlayedPlayoffs: number;
  regularGames: number;
  playoffGames: number;
};

export type CareerHighlightType =
  | "most-teams-played"
  | "most-teams-owned"
  | "same-team-seasons-played"
  | "same-team-seasons-owned"
  | "most-stanley-cups"
  | "reunion-king"
  | "stash-king"
  | "regular-grinder-without-playoffs"
  | "most-trades"
  | "most-claims"
  | "most-drops";

export type CareerHighlightTeam = {
  id: string;
  name: string;
};

export type CareerTransactionHighlightTeam = CareerHighlightTeam & {
  count: number;
};

export type CareerTeamCountHighlightItem = {
  id: string;
  name: string;
  position: string;
  teamCount: number;
  teams: CareerHighlightTeam[];
};

export type CareerSameTeamHighlightItem = {
  id: string;
  name: string;
  position: string;
  seasonCount: number;
  team: CareerHighlightTeam;
};

export type CareerStanleyCupHighlightCup = {
  season: number;
  team: CareerHighlightTeam;
};

export type CareerStanleyCupHighlightItem = {
  id: string;
  name: string;
  position: string;
  cupCount: number;
  cups: CareerStanleyCupHighlightCup[];
};

export type CareerReunionType = "claim" | "trade";

export type CareerReunionHighlightReunion = {
  date: string;
  type: CareerReunionType;
};

export type CareerReunionHighlightItem = {
  id: string;
  name: string;
  position: string;
  reunionCount: number;
  team: CareerHighlightTeam;
  reunions: CareerReunionHighlightReunion[];
};

export type CareerStashHighlightItem = {
  id: string;
  name: string;
  position: string;
  seasonCount: number;
  team: CareerHighlightTeam;
};

export type CareerRegularGrinderHighlightItem = {
  id: string;
  name: string;
  position: string;
  regularGames: number;
  teams: CareerHighlightTeam[];
};

export type CareerTransactionHighlightItem = {
  id: string;
  name: string;
  position: string;
  transactionCount: number;
  teams: CareerTransactionHighlightTeam[];
};

export type CareerTeamCountHighlightPage = {
  type: "most-teams-played" | "most-teams-owned";
  minAllowed: number;
  skip: number;
  take: number;
  total: number;
  items: CareerTeamCountHighlightItem[];
};

export type CareerSameTeamHighlightPage = {
  type: "same-team-seasons-played" | "same-team-seasons-owned";
  minAllowed: number;
  skip: number;
  take: number;
  total: number;
  items: CareerSameTeamHighlightItem[];
};

export type CareerStanleyCupHighlightPage = {
  type: "most-stanley-cups";
  minAllowed: number;
  skip: number;
  take: number;
  total: number;
  items: CareerStanleyCupHighlightItem[];
};

export type CareerReunionHighlightPage = {
  type: "reunion-king";
  minAllowed: number;
  skip: number;
  take: number;
  total: number;
  items: CareerReunionHighlightItem[];
};

export type CareerStashHighlightPage = {
  type: "stash-king";
  minAllowed: number;
  skip: number;
  take: number;
  total: number;
  items: CareerStashHighlightItem[];
};

export type CareerRegularGrinderHighlightPage = {
  type: "regular-grinder-without-playoffs";
  minAllowed: number;
  skip: number;
  take: number;
  total: number;
  items: CareerRegularGrinderHighlightItem[];
};

export type CareerTransactionHighlightPage = {
  type: "most-trades" | "most-claims" | "most-drops";
  minAllowed: number;
  skip: number;
  take: number;
  total: number;
  items: CareerTransactionHighlightItem[];
};

export type CareerHighlightsPage =
  | CareerTeamCountHighlightPage
  | CareerSameTeamHighlightPage
  | CareerStanleyCupHighlightPage
  | CareerReunionHighlightPage
  | CareerStashHighlightPage
  | CareerRegularGrinderHighlightPage
  | CareerTransactionHighlightPage;
