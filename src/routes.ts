import { send } from 'micro';
import { AugmentedRequestHandler, ServerRequest } from 'microrouter';
import csv from 'csvtojson';
import path from 'path';

interface Player {
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

export const parseFile: AugmentedRequestHandler = async (req, res) => {
  const report: string = req.params.fileName;
  const sortBy: string | undefined = req.params.sortBy;
  const defaultSort = (a: Player, b: Player) =>
    b.points - a.points || b.goals - a.goals;

  if (report !== 'playoffs' && report !== 'runkosarja') {
    send(res, 500, 'Invalid report type');
  }

  const fileArray = ['2012-2013', '2013-2014', '2014-2015', '2015-2016'];

  const data1 = await csv().fromFile(
    path.join(__dirname, '../csv') + `/${report}-${fileArray[0]}.csv`,
  );
  const data2 = await csv().fromFile(
    path.join(__dirname, '../csv') + `/${report}-${fileArray[1]}.csv`,
  );
  const data3 = await csv().fromFile(
    path.join(__dirname, '../csv') + `/${report}-${fileArray[2]}.csv`,
  );
  const data4 = await csv().fromFile(
    path.join(__dirname, '../csv') + `/${report}-${fileArray[3]}.csv`,
  );

  const rawData = [...data1, ...data2, ...data3, ...data4];
  const playerData = rawData
    .filter(
      (item, i) =>
        i !== 0 &&
        item.field2 !== '' &&
        item.Skaters !== 'G' &&
        Number(item.field7) > 0,
    )
    .map((item, i) => ({
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
    }));

  const result = [
    ...playerData
      .reduce((r, o) => {
        const key = o.name;

        const item: Player = r.get(key) || {
          ...o,
          ...{
            games: 0,
            goals: 0,
            assists: 0,
            points: 0,
          },
        };

        item.games += o.games;
        item.goals += o.goals;
        item.assists += o.assists;
        item.points += o.points;
        item.plusMinus += o.plusMinus;
        item.penalties += o.penalties;
        item.shots += o.shots;
        item.ppp += o.ppp;
        item.shp += o.shp;
        item.hits += o.hits;
        item.blocks += o.blocks;

        return r.set(key, item);
      }, new Map())
      .values(),
  ].sort((a, b) => (sortBy ? b[sortBy] - a[sortBy] : defaultSort(a, b)));

  send(res, 200, result);
};
