# Finals Rating

`/leaderboard/finals` returns raw away/home totals, category results, champion-oriented `rates`, and paired `factors`. Values are fractions in `[0, 1]`, rounded to three decimals (`0.567` = 56.7%). Player/goalie scores are separate: [scoring](scoring.md).

Implementation: [finals/scoring.ts](../src/features/finals/scoring.ts); configurable qualification/tiebreak constants: [settings.ts](../src/config/settings.ts). Read those for exact formulas and current weights.

## Rates

`winRate = winnerMatchPoints / totalCategories`, where total categories includes wins, losses and ties. Non-positive totals return 0.5. This describes the actual scoreboard share.

`deservedToWinRate` averages weighted category confidences from the actual winner's perspective, adjusting production for games played. Above 0.5 favors the winner's underlying performance; below 0.5 favors the loser despite the result. It is a model, not a replay of category wins.

| Category | Confidence model |
| --- | --- |
| Counting stats | Per-skater-game rates, or per-goalie-game for wins/saves/shutouts; normal-CDF comparison of the rate difference using rate/exposure variance |
| `plusMinus` | Per-skater-game comparison with sample standard deviation across imported finalists; scale floor 0.05 handles small/noisy samples |
| `gaa` | Lower is better; standard error uses goalie-game exposure |
| `savePercent` | Higher is better; reconstruct shots against as saves/savePercent and use pooled-proportion standard error |

For counting stats, simplified confidence is `NormalCDF((winnerRate - loserRate) / sqrt(winnerRate/winnerExposure + loserRate/loserExposure))`; zero standard error is neutral 0.5. Equal plus-minus rates are neutral.

Goalie-rate qualification requires at least two goalie games. If only the winner qualifies, confidence is 0.65; only the loser, 0.35; neither qualifies or qualified values are missing, 0.5. Qualification is intentionally a softened edge, not proof of superior goalie play. Both near-zero GAAs are neutral. Non-positive reconstructed shots fall back to direct save-percentage comparison; ties or pooled proportions effectively zero/one are neutral.

Current category weights are 0.75 for plus-minus, 0.6 for short-handed points/shutouts, and 1 for others. Hits/blocks and usable goalie rates keep full weight. A home-tiebreak win adds confidence 0.25 at weight 1.5, reflecting an advantage earned before the final rather than finals dominance. Sum weighted confidence contributions and divide by total weight; zero total weight returns 0.5.

## Matchup factors

`factors.awayTeam` and `factors.homeTeam` contain offence, physical, and goalies shares. Each paired factor sums to 1. These describe how production/goalie influence split between finalists; they do not replace the rates above.

| Factor | Calculation |
| --- | --- |
| `offence` | Team sum of goals, assists, shots, ppp, shp divided by both teams' sum; exclude points to avoid double counting |
| `physical` | Team sum of hits, blocks, penalties divided by both teams' sum |
| `goalies` | Equal blend of volume share (wins+saves+shutouts) and efficiency share |

Efficiency averages the save-percentage share and inverse-GAA share. One-sided qualification gives the qualified team the full efficiency component; neither qualifying or missing paired values is neutral. Both near-zero GAAs are neutral; one near-zero GAA receives full GAA share. Production sums at or below zero are neutral.
