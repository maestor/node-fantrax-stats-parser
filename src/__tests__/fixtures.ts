import type {
  Goalie,
  GoalieWithSeason,
  Player,
  PlayerWithSeason,
  RawData,
} from "../shared/types/index.js";

// Raw data fixtures for players
export const mockRawDataPlayer: RawData = {
  Skaters: "*p001*",
  season: 2024,
  field2: "F",
  field3: "Connor McDavid",
  field4: "EDM",
  field5: "F",
  field6: "Act",
  field7: "@SJS",
  field8: "82",
  field9: "50",
  field10: "75",
  field11: "125",
  field12: "25",
  field13: "20",
  field14: "350",
  field15: "40",
  field16: "5",
  field17: "30",
  field18: "25",
  field19: "",
};

export const mockRawDataPlayerWithCommas: RawData = {
  Skaters: "*p002*",
  season: 2024,
  field2: "F",
  field3: "Test Player",
  field4: "TOR",
  field5: "F",
  field6: "Act",
  field7: "@MTL",
  field8: "82", // No comma in games field (used in filter)
  field9: "5,678", // Commas in other fields
  field10: "9,012",
  field11: "14,690",
  field12: "100",
  field13: "200",
  field14: "3,000",
  field15: "400",
  field16: "50",
  field17: "600",
  field18: "700",
  field19: "",
};

export const mockRawDataGoalie: RawData = {
  Skaters: "*g001*",
  season: 2024,
  field2: "G",
  field3: "Test Goalie",
  field4: "TOR",
  field5: "G",
  field6: "Act",
  field7: "@MTL",
  field8: "65",
  field9: "40",
  field10: "2.50",
  field11: "2000",
  field12: "0.920",
  field13: "10",
  field14: "15",
  field15: "5",
  field16: "10",
  field17: "15",
  field18: "2",
  field19: "1",
};

// Raw data for goalie with old column order (season <= 2013)
export const mockRawDataGoalie2012: RawData = {
  Skaters: "*g002*",
  season: 2012,
  field2: "G",
  field3: "Carey Price",
  field4: "MTL",
  field5: "G",
  field6: "Act",
  field7: "vs TOR",
  field8: "70", // games in 2012
  field9: "40", // wins in 2012
  field10: "2.30",
  field11: "2000",
  field12: "0.920",
  field13: "10",
  field14: "15",
  field15: "5",
  field16: "10",
  field17: "15",
  field18: "2",
  field19: "1",
};

// Raw data for goalie with normalized column order (season >= 2014)
export const mockRawDataGoalie2014: RawData = {
  Skaters: "*g002*",
  season: 2014,
  field2: "G",
  field3: "Carey Price",
  field4: "MTL",
  field5: "G",
  field6: "Act",
  field7: "vs TOR",
  field8: "70", // GP
  field9: "40", // W-G (wins)
  field10: "2.30",
  field11: "2000",
  field12: "0.920",
  field13: "10",
  field14: "15",
  field15: "5",
  field16: "10",
  field17: "15",
  field18: "2",
  field19: "1",
};

// Raw data for goalie with newest column order (season >= 2025)
// Matches Fantrax export where field7 = GP and field8 = W-G
export const mockRawDataGoalie2025: RawData = {
  Skaters: "*g003*",
  season: 2025,
  field2: "G",
  field3: "Jake Oettinger",
  field4: "DAL",
  field5: "G",
  field6: "Act",
  field7: "",
  field8: "23", // GP
  field9: "15", // W-G (wins)
  field10: "2.44",
  field11: "570",
  field12: ".911",
  field13: "2",
  field14: "0",
  field15: "0",
  field16: "1",
  field17: "1",
  field18: "0",
  field19: "0",
};

// Raw data for goalie without field18 (empty string to test ternary)
export const mockRawDataGoalieNoField18: RawData = {
  Skaters: "*g004*",
  season: 2014,
  field2: "G",
  field3: "Test Goalie No SHP",
  field4: "TOR",
  field5: "G",
  field6: "Act",
  field7: "@MTL",
  field8: "30",
  field9: "60",
  field10: "2.75",
  field11: "1500",
  field12: "0.910",
  field13: "5",
  field14: "10",
  field15: "3",
  field16: "7",
  field17: "10",
  field18: "1",
  field19: "",
};

// Raw data that should be filtered out
export const mockRawDataFirstRow: RawData = {
  Skaters: "ID",
  season: 2024,
  field2: "Pos",
  field3: "Name",
  field4: "Team",
  field5: "Pos",
  field6: "Status",
  field7: "Opp",
  field8: "GP",
  field9: "G",
  field10: "A",
  field11: "PTS",
  field12: "+/-",
  field13: "PIM",
  field14: "SOG",
  field15: "PPP",
  field16: "SHP",
  field17: "HIT",
  field18: "BLK",
  field19: "",
};

export const mockRawDataEmptyName: RawData = {
  Skaters: "*p999*",
  season: 2024,
  field2: "F",
  field3: "",
  field4: "TOR",
  field5: "F",
  field6: "Act",
  field7: "@MTL",
  field8: "50",
  field9: "20",
  field10: "30",
  field11: "50",
  field12: "10",
  field13: "5",
  field14: "100",
  field15: "15",
  field16: "2",
  field17: "40",
  field18: "20",
  field19: "",
};

export const mockRawDataZeroGames: RawData = {
  Skaters: "*p003*",
  season: 2024,
  field2: "F",
  field3: "Zero Games Player",
  field4: "TOR",
  field5: "F",
  field6: "Act",
  field7: "@MTL",
  field8: "0",
  field9: "0",
  field10: "0",
  field11: "0",
  field12: "0",
  field13: "0",
  field14: "0",
  field15: "0",
  field16: "0",
  field17: "0",
  field18: "0",
  field19: "",
};

export const createPlayer = (overrides: Partial<Player> = {}): Player => ({
  id: "id",
  name: "Player",
  games: 0,
  goals: 0,
  assists: 0,
  points: 0,
  plusMinus: 0,
  penalties: 0,
  shots: 0,
  ppp: 0,
  shp: 0,
  hits: 0,
  blocks: 0,
  score: 0,
  scoreAdjustedByGames: 0,
  ...overrides,
});

export const createGoalie = (overrides: Partial<Goalie> = {}): Goalie => ({
  id: "id",
  name: "Goalie",
  games: 0,
  wins: 0,
  saves: 0,
  shutouts: 0,
  goals: 0,
  assists: 0,
  points: 0,
  penalties: 0,
  ppp: 0,
  shp: 0,
  score: 0,
  scoreAdjustedByGames: 0,
  ...overrides,
});

// Typed player and goalie fixtures
export const mockPlayer: Player = createPlayer({
  id: "p100",
  name: "Test Player",
  position: "F",
  games: 82,
  goals: 50,
  assists: 75,
  points: 125,
  plusMinus: 25,
  penalties: 20,
  shots: 350,
  ppp: 40,
  shp: 5,
  hits: 30,
  blocks: 25,
});

export const mockPlayerWithSeason: PlayerWithSeason = {
  ...mockPlayer,
  season: 2024,
};

export const mockGoalie: Goalie = createGoalie({
  id: "g100",
  name: "Test Goalie",
  games: 70,
  wins: 40,
  saves: 2000,
  shutouts: 10,
  goals: 5,
  assists: 10,
  points: 15,
  penalties: 15,
  ppp: 2,
  shp: 1,
  gaa: "2.50",
  savePercent: "0.920",
});

export const mockGoalieWithSeason: GoalieWithSeason = {
  ...mockGoalie,
  season: 2024,
};

// Raw data for goalie with non-numeric wins field (tests parseWinsFromWG no-match branch)
export const mockRawDataGoalieNonNumericWins: RawData = {
  Skaters: "*g005*",
  season: 2014,
  field2: "G",
  field3: "Test Goalie Non-Numeric",
  field4: "TOR",
  field5: "G",
  field6: "Act",
  field7: "@MTL",
  field8: "30", // GP
  field9: "N/A", // Non-numeric wins (regex won't match)
  field10: "2.75",
  field11: "1500",
  field12: "0.910",
  field13: "5",
  field14: "10",
  field15: "3",
  field16: "7",
  field17: "10",
  field18: "1",
  field19: "0",
};
