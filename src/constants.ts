import {
  Report,
  PlayerScoreField,
  GoalieScoreField,
  PlayerScoreWeights,
  GoalieScoreWeights,
  Team,
} from "./types";

export const START_SEASON = 2012;

export const REPORT_TYPES: Report[] = ["playoffs", "regular", "both"];

export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export const ERROR_MESSAGES = {
  INVALID_REPORT_TYPE: "Invalid report type",
  SEASON_NOT_AVAILABLE: "Stats for given season are not available",
  TEAM_CSV_FOLDER_MISSING: (teamId: string) =>
    `Team ${teamId} is configured but csv/${teamId}/ folder is missing. Add CSV files there or remove the team from TEAMS.`,
};

export const DEFAULT_TEAM_ID = "1";

export const TEAMS: ReadonlyArray<Team> = [
  { id: "1", name: "colorado", presentName: "Colorado Avalanche" },
  { id: "2", name: "carolina", presentName: "Carolina Hurricanes" },
  { id: "3", name: "calgary", presentName: "Calgary Flames" },
  { id: "4", name: "vancouver", presentName: "Vancouver Canucks" },
  { id: "5", name: "montreal", presentName: "Montreal Canadiens" },
  { id: "6", name: "detroit", presentName: "Detroit Red Wings" },
  { id: "7", name: "edmonton", presentName: "Edmonton Oilers" },
  { id: "8", name: "sanjose", presentName: "San Jose Sharks" },
  { id: "9", name: "nyrangers", presentName: "New York Rangers" },
  { id: "10", name: "nashville", presentName: "Nashville Predators" },
  { id: "11", name: "losangeles", presentName: "Los Angeles Kings" },
  { id: "12", name: "anaheim", presentName: "Anaheim Ducks" },
  { id: "13", name: "chicago", presentName: "Chicago Blackhawks" },
  { id: "14", name: "minnesota", presentName: "Minnesota Wild" },
  { id: "15", name: "stlouis", presentName: "St. Louis Blues" },
  { id: "16", name: "tampabay", presentName: "Tampa Bay Lightning" },
  { id: "17", name: "florida", presentName: "Florida Panthers" },
  { id: "18", name: "boston", presentName: "Boston Bruins" },
  { id: "19", name: "toronto", presentName: "Toronto Maple Leafs" },
  { id: "20", name: "ottawa", presentName: "Ottawa Senators" },
  { id: "21", name: "buffalo", presentName: "Buffalo Sabres" },
  { id: "22", name: "philadelphia", presentName: "Philadelphia Flyers" },
  { id: "23", name: "nyislanders", presentName: "New York Islanders" },
  { id: "24", name: "newjersey", presentName: "New Jersey Devils" },
  { id: "25", name: "washington", presentName: "Washington Capitals" },
  { id: "26", name: "pittsburgh", presentName: "Pittsburgh Penguins" },
  { id: "27", name: "columbus", presentName: "Columbus Blue Jackets" },
  { id: "28", name: "seattle", presentName: "Seattle Kraken", firstSeason: 2021 },
  { id: "29", name: "dallas", presentName: "Dallas Stars" },
  { id: "30", name: "winnipeg", presentName: "Winnipeg Jets" },
  { id: "31", name: "utah", presentName: "Utah Mammoth", nameAliases: ['Utah Hockey Club', 'Arizona Coyotes', 'Phoenix Coyotes', 'Arizona', 'Phoenix'] },
  { id: "32", name: "vegas", presentName: "Vegas Golden Knights", firstSeason: 2017 },
];

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

export const GOALIE_SCORE_FIELDS: GoalieScoreField[] = ["wins", "saves", "shutouts"];

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
  gaa: 1,
  savePercent: 1,
};

// Advanced goalie stat scaling (used to avoid extreme 0/100 scores when values are close)
// If a goalie's GAA is worse than the best GAA by this ratio or more, they get 0 for the GAA component.
// Example: ratio 0.5 means a goalie with 50% worse GAA than the best maps to 0.
export const GOALIE_GAA_MAX_DIFF_RATIO = 0.5;

// Baseline save percentage for scoring (used to avoid extreme 0 scores)
export const GOALIE_SAVE_PERCENT_BASELINE = 0.85; // .850

// Minimum games required for games-adjusted scoring (players and goalies)
export const MIN_GAMES_FOR_ADJUSTED_SCORE = 1;

// Default CSV directory for Playwright imports
export const DEFAULT_CSV_OUT_DIR = "./csv/temp/";

// Fantrax URLs for Playwright to use
export const FANTRAX_URLS = {
  login: "https://www.fantrax.com/login",
  league: "https://www.fantrax.com/fantasy/league",
  leagueArchive: "https://www.fantrax.com/fantasy/league/all;view=LEAGUES",
};
