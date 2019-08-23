export interface Player {
  name: string;
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
}

export type PlayerFields =
  | 'name'
  | 'games'
  | 'goals'
  | 'assists'
  | 'points'
  | 'plusMinus'
  | 'penalties'
  | 'shots'
  | 'ppp'
  | 'shp'
  | 'hits'
  | 'blocks';

export interface RawData {
  Skaters: string;
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
}

export type Seasons = number[];

export type Report = 'regular' | 'playoffs';
