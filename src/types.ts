interface Common {
  name: string;
  games: number;
  goals: number;
  assists: number;
  points: number;
  penalties: number;
  ppp: number;
  shp: number;
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
  isSeason: boolean;
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
  field18?: string;
}

export type Seasons = number[];

export type Report = "regular" | "playoffs";
