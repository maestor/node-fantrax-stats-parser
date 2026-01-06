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

Each player and goalie item returned by the stats endpoints includes a computed `score` field, an additional games-adjusted `scoreAdjustedByGames` field, plus a per-stat breakdown in a `scores` object.

- **Range and precision**: `score` is a number between 0 and 100, rounded to two decimals.
- **Player scoring fields**: `goals`, `assists`, `points`, `plusMinus`, `penalties`, `shots`, `ppp`, `shp`, `hits`, `blocks`.
- **Goalie scoring fields**: `wins`, `saves`, `shutouts`, and when available `gaa` (goals against average) and `savePercent`.

Scoring is calculated in two steps:

1. **Per‑stat normalization**
   - For most non‑negative fields (goals, assists, points, penalties, shots, ppp, shp, hits, blocks, wins, saves, shutouts), scoring normalizes from a baseline of 0 up to the maximum value observed in the current result set. For goalies, only `wins`, `saves`, and `shutouts` are included in this part of the score. A value of 0 maps to 0, the maximum maps to 100, and values in between are placed linearly between them.
   - For `plusMinus`, scoring uses the minimum and maximum values observed in the result set, and the minimum can be negative. The worst `plusMinus` maps to 0, the best to 100, and values in between are placed linearly between them (for example, with max = 20 and min = -10, `plusMinus` 5 is halfway between and scores 50.0 for that component).
   - For goalies, `savePercent` and `gaa` are scored relative to the best value in the dataset using more stable scaling rather than raw min/max. For `savePercent`, a fixed baseline defined by `GOALIE_SAVE_PERCENT_BASELINE` in `src/constants.ts` (default .850) maps to 0 points and the best save% in the result set maps to 100, with other values placed linearly between; for `gaa`, the lowest GAA maps to 100 and other goalies are down‑weighted linearly based on how much worse they are than the best, up to a configurable cutoff defined by `GOALIE_GAA_MAX_DIFF_RATIO` in `src/constants.ts`. This avoids extreme 0/100 scores when all available goalies have very similar advanced stats.

2. **Overall score**
   - For each item, scores from all scoring fields are summed and divided by the number of fields that actually contributed for that item (for goalies this means `gaa` and `savePercent` are only counted when present).
   - The result is clamped to the `[0, 100]` range and rounded to two decimals.

3. **Games‑adjusted score (`scoreAdjustedByGames`)**
   - `scoreAdjustedByGames` uses the same scoring fields and weights as the main `score`, but works on per‑game values instead of totals (for example, `goalsPerGame = goals / games`).
   - Players and goalies with fewer than `MIN_GAMES_FOR_ADJUSTED_SCORE` games (configured in `src/constants.ts`, default 3) always get `scoreAdjustedByGames = 0` to avoid one‑game outliers appearing at the top.
   - For eligible players, per‑game values for each stat are normalized in the same way as totals (including per‑game plusMinus), then averaged into a 0–100 score. For goalies, only per‑game `wins`, `saves`, and `shutouts` are used; advanced stats (`gaa`, `savePercent`) do not contribute to `scoreAdjustedByGames`.

In addition to the overall `score`, each item exposes a `scores` object containing the normalized 0–100 value for every individual scoring stat before weights are applied (for example, `scores.goals`, `scores.hits`, `scores.wins`, `scores.savePercent`, `scores.gaa`). This makes it easy to see which categories drive a player’s or goalie’s total score.

### Weights

By default every scoring field has weight `1.0` (full value), so they all contribute equally.

Weights are defined in `src/constants.ts`:

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

Test coverage: 100% statements, 100% functions, 100% lines, 100% branches. Coverage reports are generated in the `coverage/` directory.

## Todo

- Start using database and CSV import tool
- Find out if Fantrax offers some API to get needed data easily instead of CSV export

Feel free to suggest feature / implementation polishing with writing issue or make PR if you want to contribute!
