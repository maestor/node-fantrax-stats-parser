import { RawData, Player } from './types';

export const mapPlayerData = (data: RawData[]): Player[] => {
  return data
    .filter(
      (item: RawData, i: number) =>
        i !== 0 &&
        item.field2 !== '' &&
        item.Skaters !== 'G' &&
        Number(item.field7) > 0,
    )
    .map(
      (item: RawData): Player => ({
        name: item.field2,
        games: Number(item.field7) || 0,
        goals: Number(item.field8) || 0,
        assists: Number(item.field9) || 0,
        points: Number(item.field10) || 0,
        plusMinus: Number(item.field11) || 0,
        penalties: Number(item.field12) || 0,
        shots: Number(item.field13) || 0,
        ppp: Number(item.field14) || 0,
        shp: Number(item.field15) || 0,
        hits: Number(item.field16) || 0,
        blocks: Number(item.field17) || 0,
      }),
    );
};
