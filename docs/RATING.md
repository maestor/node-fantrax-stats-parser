# Rating Models

This document covers rating-style models that are related to FFHL results analysis but are not part of the player/goalie `score` and `scoreAdjustedByGames` model described in [SCORING.md](SCORING.md).

## Finals Rates

`/leaderboard/finals` returns a `rates` object for each imported finals season:

- `winRate`
- `deservedToWinRate`

Both values follow the API's normal percentage convention:

- values are returned as fractions between `0` and `1`
- values are rounded to three decimals
- example: `0.567` means `56.7%`

## What Each Rate Means

### `winRate`

`winRate` reflects the actual finals scoreboard result for the champion.

Formula:

```text
winnerMatchPoints / totalCategories
```

Where:

- `winnerMatchPoints` comes from the imported finals result
- `totalCategories = categoriesWon + categoriesLost + categoriesTied`
- if `totalCategories <= 0`, the API falls back to `0.5`

Example:

- champion match points: `8.5`
- total categories: `15`
- `winRate = 8.5 / 15 = 0.567`

This rate answers: "How much of the actual finals scoreboard did the winner capture?"

### `deservedToWinRate`

`deservedToWinRate` is a games-adjusted strength model for the actual finals winner. Instead of looking only at the raw category scoreboard, it asks whether the winner's underlying category performance looked stronger than the loser's once differing skater and goalie game counts are taken into account, while also accounting for a couple of structural finals advantages.

This rate answers: "Given the category totals and the number of games each finalist actually used, how convincing was the winner's underlying performance?"

## Input Data Used By The Model

The finals model compares the imported away and home finalists using:

- skater counting totals: `goals`, `assists`, `points`, `plusMinus`, `penalties`, `shots`, `ppp`, `shp`, `hits`, `blocks`
- goalie counting totals: `wins`, `saves`, `shutouts`
- goalie rate stats when qualified: `gaa`, `savePercent`
- played-game counts:
  - `playedGames.skaters`
  - `playedGames.goalies`

Exposure is stat-specific:

- skater stats are compared per skater game
- `wins`, `saves`, and `shutouts` are compared per goalie game
- `gaa` and `savePercent` use their own rate-specific confidence logic

## Category Confidence Model

For each stat, the model estimates how strongly the actual winner outperformed the loser in rate terms. Each category produces a confidence value between `0` and `1`:

- near `1.0`: strong evidence the winner was better in that category
- near `0.5`: effectively neutral
- near `0.0`: evidence the loser was better in that category

The final `deservedToWinRate` is the weighted average of those category confidences.

### Counting stats

For most stats, the model:

1. Converts totals to rates using the relevant exposure.
2. Estimates variance from those rates and exposures.
3. Converts the winner-vs-loser edge into a normal-CDF confidence.

In simplified form:

```text
winnerRate = winnerValue / winnerExposure
loserRate = loserValue / loserExposure

winnerVariance = winnerRate / winnerExposure
loserVariance = loserRate / loserExposure
standardError = sqrt(winnerVariance + loserVariance)
confidence = NormalCDF((winnerRate - loserRate) / standardError)
```

If the standard error collapses to zero, the model returns a neutral `0.5`.

This behavior is why a finalist can have a lower raw total but still improve `deservedToWinRate` if that total came from materially fewer games.

### `plusMinus`

`plusMinus` is treated differently because it can be negative and tends to swing more noisily than pure counting totals.

The model:

- compares plus-minus on a per-skater-game basis
- measures the leaguewide finals spread from all imported finalists
- builds a shared scale from the sample standard deviation of those rates
- enforces a floor of `0.05` so the model never becomes unrealistically certain in tiny samples

If the winner and loser have effectively identical plus-minus rates, the result is neutral `0.5`.

### `gaa`

`gaa` is only meaningful when a team qualifies for goalie rate stats.

Qualification rule:

- a finalist must have at least `2` goalie games

Comparison rules:

- if only the winner qualifies, the category confidence is `0.65`
- if only the loser qualifies, the category confidence is `0.35`
- if neither qualifies, the category confidence is `0.5`
- if both qualify but either `gaa` value is missing, the category confidence is `0.5`
- lower `gaa` is better

When both teams qualify with usable values, the model compares them through a standard-error calculation based on goalie-game exposure. If both GAAs are effectively zero, the result is neutral `0.5`.

The `0.65` / `0.35` split is intentional: qualifying for goalie-rate categories is a real edge, but not full proof that the qualified team had stronger underlying goalie play.

### `savePercent`

`savePercent` follows the same qualification gate as `gaa`:

- minimum `2` goalie games

Comparison rules:

- if only the winner qualifies, the category confidence is `0.65`
- if only the loser qualifies, the category confidence is `0.35`
- if neither qualifies, the category confidence is `0.5`
- if both qualify but either save percentage is missing, the category confidence is `0.5`
- higher `savePercent` is better

When both teams qualify, the model reconstructs shots against from:

```text
shotsAgainst = saves / savePercent
```

It then uses a pooled-proportion standard error to estimate confidence.

Special handling keeps edge cases stable:

- if reconstructed shots against are non-positive, the model falls back to direct save-percentage comparison
- if both sides are effectively identical in that zero-shot scenario, the result is `0.5`
- if the pooled save percentage is effectively `0` or `1`, the result is `0.5`

As with `gaa`, one-sided qualification is treated as a meaningful but softened edge instead of an automatic full-confidence win.

## Structural Finals Edges

The model also accounts for structural advantages that are not the same thing as underlying finals dominance.

### Home-team tiebreak

If the champion won specifically on the home-team tiebreak after a level finals scoreboard, `deservedToWinRate` applies a small negative adjustment to the winner.

That adjustment exists because:

- the winner benefited from a pre-finals edge earned in the regular season
- winning via that edge is not as strong a finals-only signal as winning outright on the category scoreboard

Current tiebreak adjustment:

- winner confidence contribution: `0.25`
- weight: `1.5`

In practice, this means a perfectly even finals that the home team wins on tiebreak will land slightly below neutral in `deservedToWinRate`.

## Weights

The weighted finals model uses the following category weights:

- `plusMinus`: `0.75`
- `shp`: `0.6`
- `shutouts`: `0.6`
- every other finals category: `1.0`

This means the model intentionally downweights only three noisier swing categories while keeping the rest of the finals categories at full strength.

In particular:

- `hits` and `blocks` stay at full weight
- goalie rate categories are included at full weight when qualification allows them to participate meaningfully

If every category weight were set to `0`, the model would return the neutral fallback `0.5`.

## Final Aggregation

After calculating each category confidence, the API computes:

```text
sum(confidence(stat) * weight(stat)) / sum(weight(stat))
```

The result is then rounded to three decimals and returned as `deservedToWinRate`.

Interpretation:

- above `0.5`: the winner's underlying finals profile looks stronger than neutral
- near `0.5`: the matchup looks essentially even after game-count adjustment
- below `0.5`: the loser may have had the stronger underlying profile despite losing the actual finals scoreboard

Because the rate is always evaluated from the actual winner's perspective, values below `0.5` indicate a possible "won the matchup, but not the underlying profile" result.

## Relationship To The Returned Finals Payload

Each `/leaderboard/finals` item contains:

- `awayTeam` and `homeTeam` raw imported totals
- `categories`, showing the actual category-by-category finals scoreboard
- `rates.winRate`, which reflects the actual result
- `rates.deservedToWinRate`, which reflects the games-adjusted weighted model

Those two rates are intentionally complementary:

- `winRate` describes what happened on the scoreboard
- `deservedToWinRate` describes how strong the winner's underlying finals performance looked after adjusting for games played
