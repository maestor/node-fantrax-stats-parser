import {
  formatOptionalGoalieGaa,
  formatOptionalGoalieSavePercent,
} from "../shared/goalie-rates.js";
import type {
  FinalCategoryResultValue,
  FinalCategoryWinner,
} from "./finals-file.js";

export const MIN_FINALS_GOALIE_GAMES_FOR_RATE = 2;

const hasQualifiedFinalGoalieRates = (goalieGames: number): boolean =>
  goalieGames >= MIN_FINALS_GOALIE_GAMES_FOR_RATE;

export const formatFinalGoalieGaa = (
  value: number | null,
  goalieGames: number,
): string | null | undefined =>
  hasQualifiedFinalGoalieRates(goalieGames)
    ? formatOptionalGoalieGaa(value, goalieGames)
    : null;

export const formatFinalGoalieSavePercent = (
  value: number | null,
  goalieGames: number,
): string | null | undefined =>
  hasQualifiedFinalGoalieRates(goalieGames)
    ? formatOptionalGoalieSavePercent(value, goalieGames)
    : null;

export const deriveFallbackFinalGoalieGames = (args: {
  wins: number;
  saves: number;
  shutouts: number;
}): number => Math.max(args.wins, args.shutouts, args.saves > 0 ? 1 : 0);

export const compareFinalGoalieRateWinner = (
  statKey: "gaa" | "savePercent",
  awayValue: FinalCategoryResultValue,
  homeValue: FinalCategoryResultValue,
  awayGoalieGames: number,
  homeGoalieGames: number,
): FinalCategoryWinner => {
  const awayQualified = hasQualifiedFinalGoalieRates(awayGoalieGames);
  const homeQualified = hasQualifiedFinalGoalieRates(homeGoalieGames);

  if (awayQualified !== homeQualified) {
    return awayQualified ? "away" : "home";
  }

  if (!awayQualified && !homeQualified) {
    return "tie";
  }

  const awayNumber = Number(awayValue);
  const homeNumber = Number(homeValue);

  if (!Number.isFinite(awayNumber) || !Number.isFinite(homeNumber)) {
    return "tie";
  }

  if (Math.abs(awayNumber - homeNumber) < 0.000001) {
    return "tie";
  }

  if (statKey === "gaa") {
    return awayNumber < homeNumber ? "away" : "home";
  }

  return awayNumber > homeNumber ? "away" : "home";
};
