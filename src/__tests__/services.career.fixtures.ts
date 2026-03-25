import type { GoalieCareerRow, PlayerCareerRow } from "../db/queries.js";

export const createPlayerCareerRow = (
  overrides: Partial<PlayerCareerRow> = {},
): PlayerCareerRow => ({
  player_id: "p001",
  name: "Career Skater",
  position: "F",
  team_id: "1",
  season: 2024,
  report_type: "regular",
  games: 0,
  goals: 0,
  assists: 0,
  points: 0,
  plus_minus: 0,
  penalties: 0,
  shots: 0,
  ppp: 0,
  shp: 0,
  hits: 0,
  blocks: 0,
  ...overrides,
});

export const createGoalieCareerRow = (
  overrides: Partial<GoalieCareerRow> = {},
): GoalieCareerRow => ({
  goalie_id: "g001",
  name: "Career Goalie",
  team_id: "2",
  season: 2024,
  report_type: "regular",
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
  gaa: null,
  save_percent: null,
  ...overrides,
});
