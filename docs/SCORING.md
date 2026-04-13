# Scoring Model

Each player and goalie item returned by the stats endpoints includes:

- `score`
- `scoreAdjustedByGames`
- a per-stat breakdown in `scores`

`score` and `scoreAdjustedByGames` are numbers between `0` and `100`, rounded to two decimals.

## Fields

- Player scoring fields: `goals`, `assists`, `points`, `plusMinus`, `penalties`, `shots`, `ppp`, `shp`, `hits`, `blocks`
- Goalie scoring fields: `wins`, `saves`, `shutouts`, and when available `gaa` and `savePercent`

## Scoring Steps

### 1) Per-stat normalization

- Most non-negative fields normalize from `0` to the maximum value observed in the current result set
- `plusMinus` uses the observed minimum and maximum values from the result set
- Goalie base stats (`wins`, `saves`, `shutouts`) use dampened scoring via `Math.pow(value / max, 0.5) * 100`
- `savePercent` uses a fixed baseline from `GOALIE_SAVE_PERCENT_BASELINE` in `src/config/settings.ts`
- `gaa` compares each goalie against the best value in the result set using `GOALIE_GAA_MAX_DIFF_RATIO`

This keeps goalie advanced stats stable when the available pool is small or tightly clustered.

### 2) Overall score per item

- all contributing stat scores are summed
- the total is divided by the number of stats that contributed
- the result is clamped to `[0, 100]`
- the final value is rounded to two decimals

For goalies, `gaa` and `savePercent` only contribute when present.

### 3) Best-in-set normalization

After per-item scores are computed:

- the best `score` in the current result set is mapped to exactly `100`
- all other positive scores are scaled proportionally relative to that best score

### 4) Games-adjusted score

`scoreAdjustedByGames` is a pace metric:

- it uses per-game values instead of totals
- items below `MIN_GAMES_FOR_ADJUSTED_SCORE` still get `0`
- per-game stats are stabilized toward pool-average rates before scoring
- stabilization strength is controlled by `PLAYER_ADJUSTED_SCORE_PRIOR_GAMES` and `GOALIE_ADJUSTED_SCORE_PRIOR_GAMES`
- rare categories use stronger priors than common categories
- goalie adjusted scoring uses stabilized per-game `wins`, `saves`, and `shutouts`; `gaa` and `savePercent` do not contribute
- the best eligible adjusted score is normalized to exactly `100`

### 5) Position-based scoring for players

Players also receive position-relative scoring where they are compared only against players of the same position:

- `position`
- `scoreByPosition`
- `scoreByPositionAdjustedByGames`
- `scoresByPosition`

This makes forward-versus-defenseman comparisons fairer.

Position-based scores are included in both single-season and combined endpoints, including season items inside combined payloads.

## Combined Endpoints

For `/players/combined` and `/goalies/combined`:

- root-level items are scored using their combined multi-season totals
- each season entry inside `seasons` also receives its own season-local `score`, `scoreAdjustedByGames`, and `scores`

## Weights

Every scoring field defaults to weight `1.0`.

Weights live in `src/config/settings.ts`:

- `PLAYER_SCORE_WEIGHTS`
- `GOALIE_SCORE_WEIGHTS`

Each weight is a decimal between `0` and `1`. Lowering a weight reduces that stat's influence without changing the overall `0-100` scale.

## Finals Rates

`/leaderboard/finals` returns a `rates` object for each imported finals season:

- `winRate`: the champion's raw finals match-points share, `winnerMatchPoints / totalCategories`
- `deservedToWinRate`: a games-adjusted finals strength model that compares the actual winner against the loser category by category

Both rates follow the API's normal percentage convention:

- values are returned as fractions between `0` and `1`
- values are rounded to three decimals
- example: `0.567` means `56.7%`

The finals model:

- uses skater games for skater counting stats and goalie games for goalie counting stats
- keeps `hits` and `blocks` at full weight
- only downweights three noisier swing categories

Current finals weights:

- `plusMinus`: `0.75`
- `shp`: `0.6`
- `shutouts`: `0.6`
- every other finals category: `1.0`

Goalie qualification behavior matches the imported finals data:

- `wins`, `saves`, and `shutouts` always stay numeric
- `gaa` and `savePercent` become `null` when a finalist misses the two-goalie-game minimum
