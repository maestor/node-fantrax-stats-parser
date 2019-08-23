import { send } from 'micro';
import { AugmentedRequestHandler } from 'microrouter';

import { getRawDataFromFiles } from './services';
import { mapPlayerData } from './mappings';
import { Player, PlayerFields, Seasons, Report } from './types';

export const parseFile: AugmentedRequestHandler = async (req, res) => {
  const report = req.params.fileName as Report;
  const sortBy: string | undefined = req.params.sortBy;
  const defaultSort = (a: Player, b: Player) =>
    b.points - a.points || b.goals - a.goals;

  if (report !== 'playoffs' && report !== 'regular') {
    send(res, 500, 'Invalid report type');
  }

  const seasons: Seasons = [
    '2012-2013',
    '2013-2014',
    '2014-2015',
    '2015-2016',
    '2016-2017',
    '2017-2018',
    '2018-2019',
  ];

  const rawData = await getRawDataFromFiles(report, seasons);

  const result: Player[] = [
    ...mapPlayerData(rawData)
      .reduce((r, currentItem: Player) => {
        // Helper to get statfields for initializing and combining
        const itemKeys = Object.keys(currentItem) as PlayerFields[];
        // Name field we don't need for this purposes
        delete itemKeys[itemKeys.findIndex(itemKey => itemKey === 'name')];

        // Initialize item (grouped by name) or use already existing one
        const item: Player = r.get(currentItem.name) || {
          ...currentItem,
          ...itemKeys.reduce((o, field) => ({ ...o, [field]: 0 }), {}),
        };

        // Sum statfields to previously combined data
        itemKeys.forEach(
          itemKey =>
            ((item[itemKey] as number) += currentItem[itemKey] as number),
        );

        return r.set(currentItem.name, item);
      }, new Map())
      .values(),
  ].sort((a, b) => (sortBy ? b[sortBy] - a[sortBy] : defaultSort(a, b)));

  send(res, 200, result);
};
