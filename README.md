# node-fantrax-stats-parser

## Purpose

Lightweight API to parse my NHL fantasy league team stats and print combined seasons results by player (regular season &amp; playoffs separately) as JSON. CSV files exported manually from [Fantrax](https://www.fantrax.com). This is also some kind of practice to get some knowledge about micro, if it would be good replacement for example heavy express server in some use cases. And finally, I have made last years at least 95% Frontend stuff with JS, so that is good little project to keep backend stuff on my mind.

[UI written by Angular which uses this parser.](https://github.com/maestor/fantrax-stats-parser-ui)

## Installation and use

```
1. Install Node (at least 18.x recommended)
2. Clone repo
3. npm install
4. npm run dev
5. Go to endpoints mentioned below
```

## Endpoints

`/seasons` - Available seasons list (item format `{ season: 2012, text: '2012-2013' }`)

`/players/season/:reportType/:season/:sortBy` - Get player stats for a single season

`/players/combined/:reportType/:sortBy` - Get player stats combined (repository data starting from 12-13 season). Includes a 'seasons' array with individual season stats.

`/goalies/season/:reportType/:season/:sortBy` - Get goalie stats for a single season

`/goalies/combined/:reportType/:sortBy` - Get goalie stats combined (repository data starting from 12-13 season, goal against average and save percentage NOT included as combined!). Includes a 'seasons' array with individual season stats.

### Parameters

`reportType` - Required. Currently available options: regular, playoffs.

`season` - Optional. Needed only in single season endpoint. Starting year of the season want to check. If not specified, latest available season will show.

`sortBy` - Optional. Sort results by specific stats field. Currently available options: games, goals, assists, points, penalties, ppp, shp for both. shots, plusMinus, hits, blocks for players only and wins, saves, shutouts for goalies only. If not specified, sort by points (players) and by wins (goalies).

## Scoring algorithm

Each player and goalie item returned by the stats endpoints includes a computed `score` field.

- **Range and precision**: `score` is a number between 0 and 100, rounded to two decimals.
- **Player scoring fields**: `goals`, `assists`, `points`, `plusMinus`, `penalties`, `shots`, `ppp`, `shp`, `hits`, `blocks`.
- **Goalie scoring fields**: `wins`, `saves`, `shutouts`, `goals`, `assists`, `points`, `penalties`, `ppp`, `shp`, and when available `gaa` (goals against average) and `savePercent`.

Scoring is calculated in two steps:

1. **Per‑stat normalization**
   - For most fields, the best value in the result set gets 100.0 points for that field, and every other item gets a value relative to the best. For example, if the top `goals` value is 50, a player with 25 goals gets 50.0 points for the `goals` component.
   - For `plusMinus`, scoring uses both the minimum and maximum values observed in the result set. The worst `plusMinus` maps to 0, the best to 100, and values in between are placed linearly between them (for example, with max = 20 and min = -10, `plusMinus` 5 is halfway between and scores 50.0 for that component).
   - For goalies, `savePercent` is treated like other "higher is better" stats, while `gaa` is inverted so that the lowest GAA maps to 100, the highest to 0, and values in between are placed linearly between them.

2. **Overall score**
   - For each item, scores from all scoring fields are summed and divided by the number of fields that actually contributed for that item (for goalies this means `gaa` and `savePercent` are only counted when present).
   - The result is clamped to the `[0, 100]` range and rounded to two decimals.

### Weights

By default every scoring field has weight `1.0` (full value), so they all contribute equally.

Weights are defined in `src/helpers.ts`:

- `PLAYER_SCORE_WEIGHTS` controls player fields.
- `GOALIE_SCORE_WEIGHTS` controls goalie fields.

Each weight is a decimal between 0 and 1. Lowering a weight reduces the impact of that stat on the final `score` without changing the 0–100 range. To change the scoring model, adjust these weight constants and restart the server.

## Technology

Written with [TypeScript](https://www.typescriptlang.org/), using [micro](https://github.com/zeit/micro) with [NodeJS](https://nodejs.org) server to get routing work. Library called [csvtojson](https://github.com/Keyang/node-csvtojson) used for parsing sources.

## Testing

```
npm test              # Run all tests
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
```

Test coverage: 100% statements, 100% functions, 100% lines, ~95% branches. Coverage reports are generated in the `coverage/` directory.

## Todo

- Start using database and CSV import tool
- Find out if Fantrax offers some API to get needed data easily instead of CSV export

Feel free to suggest feature / implementation polishing with writing issue or make PR if you want to contribute!
