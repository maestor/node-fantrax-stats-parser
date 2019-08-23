import { send } from 'micro';
import { AugmentedRequestHandler } from 'microrouter';

import { getRawDataFromFiles } from './services';
import { mapPlayerData } from './mappings';
import { Player, PlayerFields, Report } from './types';
import { sortItemsByStatField, getAvailableSeasons } from './helpers';

export const getPlayersSeason: AugmentedRequestHandler = async (req, res) => {
  const report = req.params.reportType as Report;
  const sortBy = req.params.sortBy as PlayerFields | undefined;
  const season: number | undefined = Number(req.params.season);

  if (report !== 'playoffs' && report !== 'regular') {
    send(res, 500, 'Invalid report type');
  }

  const availableSeasons = getAvailableSeasons();

  if (season && !availableSeasons.includes(season)) {
    send(res, 500, 'Stats for this season are not available');
  }

  // Parser want seasons as array even we need just one
  const seasonParam = season
    ? availableSeasons.filter(item => season === item)
    : [Math.max(...availableSeasons)];

  const rawData = await getRawDataFromFiles(report, seasonParam);

  send(res, 200, sortItemsByStatField(mapPlayerData(rawData), sortBy));
};

export const getPlayersCombined: AugmentedRequestHandler = async (req, res) => {
  const report = req.params.reportType as Report;
  const sortBy = req.params.sortBy as PlayerFields | undefined;

  if (report !== 'playoffs' && report !== 'regular') {
    send(res, 500, 'Invalid report type');
  }

  const rawData = await getRawDataFromFiles(report, getAvailableSeasons());

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
  ];

  send(res, 200, sortItemsByStatField(result, sortBy));
};
