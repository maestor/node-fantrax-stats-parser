import { RawData, Player, Goalie, PlayerWithSeason, GoalieWithSeason } from "../types";

// Raw data fixtures for players
export const mockRawDataPlayer: RawData = {
  Skaters: "F",
  season: 2024,
  field2: "Connor McDavid",
  field3: "EDM",
  field4: "F",
  field5: "Act",
  field6: "@SJS",
  field7: "82",
  field8: "50",
  field9: "75",
  field10: "125",
  field11: "25",
  field12: "20",
  field13: "350",
  field14: "40",
  field15: "5",
  field16: "30",
  field17: "25",
  field18: "",
};

export const mockRawDataPlayerWithCommas: RawData = {
  Skaters: "F",
  season: 2024,
  field2: "Test Player",
  field3: "TOR",
  field4: "F",
  field5: "Act",
  field6: "@MTL",
  field7: "82",         // No comma in games field (used in filter)
  field8: "5,678",      // Commas in other fields
  field9: "9,012",
  field10: "14,690",
  field11: "100",
  field12: "200",
  field13: "3,000",
  field14: "400",
  field15: "50",
  field16: "600",
  field17: "700",
  field18: "",
};

export const mockRawDataGoalie: RawData = {
  Skaters: "G",
  season: 2024,
  field2: "Test Goalie",
  field3: "TOR",
  field4: "G",
  field5: "Act",
  field6: "@MTL",
  field7: "65",
  field8: "40",
  field9: "2.50",
  field10: "2000",
  field11: "0.920",
  field12: "10",
  field13: "15",
  field14: "5",
  field15: "10",
  field16: "15",
  field17: "2",
  field18: "1",
};

// Raw data for goalie with old column order (season <= 2013)
export const mockRawDataGoalie2012: RawData = {
  Skaters: "G",
  season: 2012,
  field2: "Carey Price",
  field3: "MTL",
  field4: "G",
  field5: "Act",
  field6: "vs TOR",
  field7: "70",    // games in 2012
  field8: "40",    // wins in 2012
  field9: "2.30",
  field10: "2000",
  field11: "0.920",
  field12: "10",
  field13: "15",
  field14: "5",
  field15: "10",
  field16: "15",
  field17: "2",
  field18: "1",
};

// Raw data for goalie with new column order (season > 2013)
export const mockRawDataGoalie2014: RawData = {
  Skaters: "G",
  season: 2014,
  field2: "Carey Price",
  field3: "MTL",
  field4: "G",
  field5: "Act",
  field6: "vs TOR",
  field7: "40",    // wins in 2014+
  field8: "70",    // games in 2014+
  field9: "2.30",
  field10: "2000",
  field11: "0.920",
  field12: "10",
  field13: "15",
  field14: "5",
  field15: "10",
  field16: "15",
  field17: "2",
  field18: "1",
};

// Raw data for goalie without field18 (empty string to test ternary)
export const mockRawDataGoalieNoField18: RawData = {
  Skaters: "G",
  season: 2014,
  field2: "Test Goalie No SHP",
  field3: "TOR",
  field4: "G",
  field5: "Act",
  field6: "@MTL",
  field7: "30",
  field8: "60",
  field9: "2.75",
  field10: "1500",
  field11: "0.910",
  field12: "5",
  field13: "10",
  field14: "3",
  field15: "7",
  field16: "10",
  field17: "1",
  field18: "",
};

// Raw data that should be filtered out
export const mockRawDataFirstRow: RawData = {
  Skaters: "Skaters",
  season: 2024,
  field2: "Name",
  field3: "Team",
  field4: "Pos",
  field5: "Status",
  field6: "Opp",
  field7: "GP",
  field8: "G",
  field9: "A",
  field10: "PTS",
  field11: "+/-",
  field12: "PIM",
  field13: "SOG",
  field14: "PPP",
  field15: "SHP",
  field16: "HIT",
  field17: "BLK",
  field18: "",
};

export const mockRawDataEmptyName: RawData = {
  Skaters: "F",
  season: 2024,
  field2: "",
  field3: "TOR",
  field4: "F",
  field5: "Act",
  field6: "@MTL",
  field7: "50",
  field8: "20",
  field9: "30",
  field10: "50",
  field11: "10",
  field12: "5",
  field13: "100",
  field14: "15",
  field15: "2",
  field16: "40",
  field17: "20",
  field18: "",
};

export const mockRawDataZeroGames: RawData = {
  Skaters: "F",
  season: 2024,
  field2: "Zero Games Player",
  field3: "TOR",
  field4: "F",
  field5: "Act",
  field6: "@MTL",
  field7: "0",
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
  field18: "",
};

// Typed player and goalie fixtures
export const mockPlayer: Player = {
  name: "Test Player",
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
};

export const mockPlayerWithSeason: PlayerWithSeason = {
  ...mockPlayer,
  season: 2024,
};

export const mockGoalie: Goalie = {
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
};

export const mockGoalieWithSeason: GoalieWithSeason = {
  ...mockGoalie,
  season: 2024,
};
