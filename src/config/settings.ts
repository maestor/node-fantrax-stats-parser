import type { CareerHighlightType } from "../features/career/types.js";
import type {
  GoalieScoreField,
  GoalieScoreWeights,
  PlayerScoreField,
  PlayerScoreWeights,
} from "../features/stats/types.js";
import type { Report, Team } from "../shared/types/core.js";

export const START_SEASON = 2012;
export const CURRENT_SEASON = 2025;

export const REPORT_TYPES = [
  "playoffs",
  "regular",
  "both",
] as const satisfies readonly Report[];
export const CAREER_HIGHLIGHT_TYPES = [
  "most-teams-played",
  "most-teams-owned",
  "same-team-seasons-played",
  "same-team-seasons-owned",
  "most-stanley-cups",
  "reunion-king",
  "stash-king",
  "regular-grinder-without-playoffs",
  "most-trades",
  "most-claims",
  "most-drops",
] as const satisfies readonly CareerHighlightType[];

export const DEFAULT_CAREER_HIGHLIGHT_SKIP = 0;
export const DEFAULT_CAREER_HIGHLIGHT_TAKE = 10;
export const MAX_CAREER_HIGHLIGHT_TAKE = 100;
export const CAREER_HIGHLIGHT_CONFIG = {
  "most-teams-played": {
    kind: "team-count",
    playedOnly: true,
    minCount: 4,
  },
  "most-teams-owned": {
    kind: "team-count",
    playedOnly: false,
    minCount: 5,
  },
  "same-team-seasons-played": {
    kind: "same-team-season-count",
    playedOnly: true,
    minCount: 8,
  },
  "same-team-seasons-owned": {
    kind: "same-team-season-count",
    playedOnly: false,
    minCount: 10,
  },
  "most-stanley-cups": {
    kind: "stanley-cups",
    minCount: 2,
  },
  "reunion-king": {
    kind: "reunion-count",
    minCount: 2,
  },
  "stash-king": {
    kind: "stash-count",
    minCount: 10,
  },
  "regular-grinder-without-playoffs": {
    kind: "regular-games-without-playoffs",
    minCount: 60,
  },
  "most-trades": {
    kind: "transaction-count",
    transactionType: "trade",
    minCount: 4,
  },
  "most-claims": {
    kind: "transaction-count",
    transactionType: "claim",
    minCount: 3,
  },
  "most-drops": {
    kind: "transaction-count",
    transactionType: "drop",
    minCount: 3,
  },
} as const satisfies Record<
  CareerHighlightType,
  | {
      kind: "team-count" | "same-team-season-count";
      playedOnly: boolean;
      minCount: number;
    }
  | {
      kind: "transaction-count";
      transactionType: "claim" | "drop" | "trade";
      minCount: number;
    }
  | {
      kind:
        | "stanley-cups"
        | "reunion-count"
        | "stash-count"
        | "regular-games-without-playoffs";
      minCount: number;
    }
>;

export const DEFAULT_TEAM_ID = "1";

export const TEAMS: ReadonlyArray<Team> = [
  {
    id: "1",
    name: "colorado",
    presentName: "Colorado Avalanche",
    teamAbbr: "COL",
  },
  {
    id: "2",
    name: "carolina",
    presentName: "Carolina Hurricanes",
    teamAbbr: "CAR",
  },
  { id: "3", name: "calgary", presentName: "Calgary Flames", teamAbbr: "CGY" },
  {
    id: "4",
    name: "vancouver",
    presentName: "Vancouver Canucks",
    teamAbbr: "VAN",
  },
  {
    id: "5",
    name: "montreal",
    presentName: "Montreal Canadiens",
    teamAbbr: "MTL",
  },
  {
    id: "6",
    name: "detroit",
    presentName: "Detroit Red Wings",
    teamAbbr: "DET",
  },
  {
    id: "7",
    name: "edmonton",
    presentName: "Edmonton Oilers",
    teamAbbr: "EDM",
  },
  { id: "8", name: "sanjose", presentName: "San Jose Sharks", teamAbbr: "SJS" },
  {
    id: "9",
    name: "nyrangers",
    presentName: "New York Rangers",
    teamAbbr: "NYR",
  },
  {
    id: "10",
    name: "nashville",
    presentName: "Nashville Predators",
    teamAbbr: "NSH",
  },
  {
    id: "11",
    name: "losangeles",
    presentName: "Los Angeles Kings",
    teamAbbr: "LAK",
  },
  { id: "12", name: "anaheim", presentName: "Anaheim Ducks", teamAbbr: "ANA" },
  {
    id: "13",
    name: "chicago",
    presentName: "Chicago Blackhawks",
    teamAbbr: "CHI",
  },
  {
    id: "14",
    name: "minnesota",
    presentName: "Minnesota Wild",
    teamAbbr: "MIN",
  },
  {
    id: "15",
    name: "stlouis",
    presentName: "St. Louis Blues",
    teamAbbr: "STL",
  },
  {
    id: "16",
    name: "tampabay",
    presentName: "Tampa Bay Lightning",
    teamAbbr: "TBL",
  },
  {
    id: "17",
    name: "florida",
    presentName: "Florida Panthers",
    teamAbbr: "FLA",
  },
  { id: "18", name: "boston", presentName: "Boston Bruins", teamAbbr: "BOS" },
  {
    id: "19",
    name: "toronto",
    presentName: "Toronto Maple Leafs",
    teamAbbr: "TOR",
  },
  { id: "20", name: "ottawa", presentName: "Ottawa Senators", teamAbbr: "OTT" },
  { id: "21", name: "buffalo", presentName: "Buffalo Sabres", teamAbbr: "BUF" },
  {
    id: "22",
    name: "philadelphia",
    presentName: "Philadelphia Flyers",
    teamAbbr: "PHI",
  },
  {
    id: "23",
    name: "nyislanders",
    presentName: "New York Islanders",
    teamAbbr: "NYI",
  },
  {
    id: "24",
    name: "newjersey",
    presentName: "New Jersey Devils",
    teamAbbr: "NJD",
  },
  {
    id: "25",
    name: "washington",
    presentName: "Washington Capitals",
    teamAbbr: "WSH",
  },
  {
    id: "26",
    name: "pittsburgh",
    presentName: "Pittsburgh Penguins",
    teamAbbr: "PIT",
  },
  {
    id: "27",
    name: "columbus",
    presentName: "Columbus Blue Jackets",
    teamAbbr: "CBJ",
  },
  {
    id: "28",
    name: "seattle",
    presentName: "Seattle Kraken",
    teamAbbr: "SEA",
    firstSeason: 2021,
  },
  { id: "29", name: "dallas", presentName: "Dallas Stars", teamAbbr: "DAL" },
  { id: "30", name: "winnipeg", presentName: "Winnipeg Jets", teamAbbr: "WPG" },
  {
    id: "31",
    name: "utah",
    presentName: "Utah Mammoth",
    teamAbbr: "UTA",
    nameAliases: [
      "Utah Hockey Club",
      "Arizona Coyotes",
      "Phoenix Coyotes",
      "Arizona",
      "Phoenix",
    ],
  },
  {
    id: "32",
    name: "vegas",
    presentName: "Vegas Golden Knights",
    teamAbbr: "VGK",
    firstSeason: 2017,
  },
];

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
  shutouts: 0.25,
  gaa: 1,
  savePercent: 1,
};

// Dampening exponent for goalie base stats (wins, saves, shutouts)
// Uses sqrt (0.5) to compress score ranges while preserving rank order
// Example: with max 26 wins, 14 wins scores 73.4 instead of 53.8
export const GOALIE_SCORING_DAMPENING_EXPONENT = 0.5;

// Advanced goalie stat scaling (used to avoid extreme 0/100 scores when values are close)
// If a goalie's GAA is worse than the best GAA by this ratio or more, they get 0 for the GAA component.
// Example: ratio 0.75 means a goalie with 75% worse GAA than the best maps to 0.
export const GOALIE_GAA_MAX_DIFF_RATIO = 0.6;

// Baseline save percentage for scoring (used to avoid extreme 0 scores)
export const GOALIE_SAVE_PERCENT_BASELINE = 0.85; // .850

// Minimum games required for games-adjusted scoring (players and goalies)
export const MIN_GAMES_FOR_ADJUSTED_SCORE = 1;

// Finals deserved-to-win model tuning.
// One-sided goalie-rate qualification is a meaningful edge, but not a full
// proof that the qualified team "deserved" those categories on underlying play.
export const FINALS_GOALIE_RATE_QUALIFICATION_CONFIDENCE = 0.65;

// If a champion wins specifically via the home-team tiebreak, the deserved model
// applies a small penalty because the winner benefited from a structural edge
// earned before the finals started.
export const FINALS_HOME_TIEBREAK_WINNER_CONFIDENCE = 0.25;
export const FINALS_HOME_TIEBREAK_WEIGHT = 1.5;

// Games-adjusted scores use stabilized per-game pace. Higher values pull short
// samples more strongly toward the pool-average rate for that category.
export const PLAYER_ADJUSTED_SCORE_PRIOR_GAMES: Record<
  PlayerScoreField,
  number
> = {
  goals: 8,
  assists: 8,
  points: 8,
  plusMinus: 12,
  penalties: 6,
  shots: 5,
  ppp: 12,
  shp: 30,
  hits: 6,
  blocks: 6,
};

export const GOALIE_ADJUSTED_SCORE_PRIOR_GAMES: Record<
  GoalieScoreField,
  number
> = {
  wins: 8,
  saves: 5,
  shutouts: 30,
};
