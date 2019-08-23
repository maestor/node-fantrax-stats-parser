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

  if (report !== 'playoffs' && report !== 'regular') {
    send(res, 500, 'Invalid report type');
  }

  const seasons = [
    '2012-2013',
    '2013-2014',
    '2014-2015',
    '2015-2016',
    '2016-2017',
    '2017-2018',
    '2018-2019',
  ];

  const sources = seasons.map(async season => {
    const sourceToJson = await csv().fromFile(
      path.join(__dirname, '../csv') + `/${report}-${season}.csv`,
    );
    return sourceToJson.flat();
  });

  let rawData = await Promise.all(sources);
  rawData = rawData.flat();

  const playerData = rawData
    .filter(
      (item: any, i) =>
        i !== 0 &&
        item.field2 !== '' &&
        item.Skaters !== 'G' &&
        Number(item.field7) > 0,
    )
    .map((item: any, i) => ({
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
