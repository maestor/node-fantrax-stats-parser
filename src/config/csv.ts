// CSV field mapping constants
export const CSV = {
  NAME: "field2" as const,
  SKATER_TYPE: "Skaters" as const,
  PLAYER_POSITION: "field4" as const,
  STATUS: "field5" as const,
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
} as const satisfies Record<string, string>;

// Default CSV directory for Playwright imports
export const DEFAULT_CSV_OUT_DIR = "./csv/temp/";
