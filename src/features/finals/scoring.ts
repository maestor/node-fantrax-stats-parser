import {
  FINALS_GOALIE_RATE_QUALIFICATION_CONFIDENCE,
  FINALS_HOME_TIEBREAK_WEIGHT,
  FINALS_HOME_TIEBREAK_WINNER_CONFIDENCE,
} from "../../config/settings.js";
import type {
  FinalsFactors,
  FinalsFactorSet,
  FinalsMatchupDbEntry,
  FinalsModelWeights,
  FinalsStatKey,
  FinalsTeamData,
} from "./types.js";

type FinalsScoringContext = {
  plusMinusRateScale: number;
};

const MIN_GOALIE_GAMES_FOR_RATE = 2;
const MIN_PLUS_MINUS_SCALE = 0.05;
const EPSILON = 0.000001;
const OFFENCE_FACTOR_KEYS = ["goals", "assists", "shots", "ppp", "shp"] as const;
const PHYSICAL_FACTOR_KEYS = ["hits", "blocks", "penalties"] as const;
const GOALIE_VOLUME_FACTOR_KEYS = ["wins", "saves", "shutouts"] as const;

export const FINALS_DESERVED_TO_WIN_WEIGHTS: FinalsModelWeights = {
  goals: 1,
  assists: 1,
  points: 1,
  plusMinus: 0.75,
  penalties: 1,
  shots: 1,
  ppp: 1,
  shp: 0.6,
  hits: 1,
  blocks: 1,
  wins: 1,
  saves: 1,
  shutouts: 0.6,
  gaa: 1,
  savePercent: 1,
};

const toThreeDecimals = (value: number): number =>
  Math.round(value * 1000) / 1000;

const clampShare = (value: number): number => {
  if (!Number.isFinite(value)) return 0.5;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
};

const toFactorPair = (awayShare: number): { away: number; home: number } => {
  const away = toThreeDecimals(clampShare(awayShare));
  return {
    away,
    home: toThreeDecimals(1 - away),
  };
};

const erf = (x: number): number => {
  const sign = x < 0 ? -1 : 1;
  const absoluteX = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * absoluteX);
  const y =
    1 -
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t *
      Math.exp(-absoluteX * absoluteX));

  return sign * y;
};

const standardNormalCdf = (value: number): number =>
  0.5 * (1 + erf(value / Math.SQRT2));

const getWinnerAndLoser = (
  matchup: Pick<FinalsMatchupDbEntry, "awayTeam" | "homeTeam">,
): { winner: FinalsTeamData; loser: FinalsTeamData } =>
  matchup.awayTeam.isWinner
    ? { winner: matchup.awayTeam, loser: matchup.homeTeam }
    : { winner: matchup.homeTeam, loser: matchup.awayTeam };

const getExposure = (team: FinalsTeamData, stat: FinalsStatKey): number => {
  if (stat === "wins" || stat === "saves" || stat === "shutouts") {
    return team.playedGames.goalies;
  }

  return team.playedGames.skaters;
};

const getRate = (value: number, exposure: number): number =>
  exposure > 0 ? value / exposure : 0;

const sampleStdDev = (values: readonly number[]): number => {
  if (values.length <= 1) return 0;

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (values.length - 1);

  return Math.sqrt(variance);
};

const hasQualifiedGoalieRates = (team: FinalsTeamData): boolean =>
  team.playedGames.goalies >= MIN_GOALIE_GAMES_FOR_RATE;

const qualificationConfidence = (qualified: boolean): number =>
  qualified
    ? FINALS_GOALIE_RATE_QUALIFICATION_CONFIDENCE
    : 1 - FINALS_GOALIE_RATE_QUALIFICATION_CONFIDENCE;

const sumFactorTotals = (
  team: FinalsTeamData,
  keys: readonly ("goals" | "assists" | "shots" | "ppp" | "shp" | "hits" | "blocks" | "penalties" | "wins" | "saves" | "shutouts")[],
): number => keys.reduce((sum, key) => sum + team.totals[key], 0);

const calculateShare = (awayValue: number, homeValue: number): number => {
  const total = awayValue + homeValue;
  if (total <= 0) return 0.5;
  return awayValue / total;
};

const bothTeamsQualifiedForGoalieRates = (
  awayTeam: FinalsTeamData,
  homeTeam: FinalsTeamData,
): boolean => hasQualifiedGoalieRates(awayTeam) && hasQualifiedGoalieRates(homeTeam);

const calculateSavePercentShare = (
  awayTeam: FinalsTeamData,
  homeTeam: FinalsTeamData,
): number => {
  const awayQualified = hasQualifiedGoalieRates(awayTeam);
  const homeQualified = hasQualifiedGoalieRates(homeTeam);

  if (awayQualified !== homeQualified) {
    return awayQualified ? 1 : 0;
  }

  if (!bothTeamsQualifiedForGoalieRates(awayTeam, homeTeam)) {
    return 0.5;
  }

  const awaySavePercent = awayTeam.totals.savePercent;
  const homeSavePercent = homeTeam.totals.savePercent;

  if (awaySavePercent == null || homeSavePercent == null) {
    return 0.5;
  }

  return calculateShare(awaySavePercent, homeSavePercent);
};

const calculateGaaShare = (
  awayTeam: FinalsTeamData,
  homeTeam: FinalsTeamData,
): number => {
  const awayQualified = hasQualifiedGoalieRates(awayTeam);
  const homeQualified = hasQualifiedGoalieRates(homeTeam);

  if (awayQualified !== homeQualified) {
    return awayQualified ? 1 : 0;
  }

  if (!bothTeamsQualifiedForGoalieRates(awayTeam, homeTeam)) {
    return 0.5;
  }

  const awayGaa = awayTeam.totals.gaa;
  const homeGaa = homeTeam.totals.gaa;

  if (awayGaa == null || homeGaa == null) {
    return 0.5;
  }

  if (awayGaa <= EPSILON && homeGaa <= EPSILON) {
    return 0.5;
  }

  if (awayGaa <= EPSILON) return 1;
  if (homeGaa <= EPSILON) return 0;

  return calculateShare(1 / awayGaa, 1 / homeGaa);
};

const calculateGoalieEfficiencyShare = (
  awayTeam: FinalsTeamData,
  homeTeam: FinalsTeamData,
): number =>
  (calculateGaaShare(awayTeam, homeTeam) +
    calculateSavePercentShare(awayTeam, homeTeam)) /
  2;

const buildFactorSetPair = (
  awayTeam: FinalsTeamData,
  homeTeam: FinalsTeamData,
): FinalsFactors => {
  const offence = toFactorPair(
    calculateShare(
      sumFactorTotals(awayTeam, OFFENCE_FACTOR_KEYS),
      sumFactorTotals(homeTeam, OFFENCE_FACTOR_KEYS),
    ),
  );
  const physical = toFactorPair(
    calculateShare(
      sumFactorTotals(awayTeam, PHYSICAL_FACTOR_KEYS),
      sumFactorTotals(homeTeam, PHYSICAL_FACTOR_KEYS),
    ),
  );
  const goalieVolume = calculateShare(
    sumFactorTotals(awayTeam, GOALIE_VOLUME_FACTOR_KEYS),
    sumFactorTotals(homeTeam, GOALIE_VOLUME_FACTOR_KEYS),
  );
  const goalieEfficiency = calculateGoalieEfficiencyShare(awayTeam, homeTeam);
  const goalies = toFactorPair((goalieVolume + goalieEfficiency) / 2);

  const awayTeamFactors: FinalsFactorSet = {
    offence: offence.away,
    physical: physical.away,
    goalies: goalies.away,
  };
  const homeTeamFactors: FinalsFactorSet = {
    offence: offence.home,
    physical: physical.home,
    goalies: goalies.home,
  };

  return {
    awayTeam: awayTeamFactors,
    homeTeam: homeTeamFactors,
  };
};

const confidenceForCountRate = (
  winnerValue: number,
  loserValue: number,
  winnerExposure: number,
  loserExposure: number,
): number => {
  const winnerRate = getRate(winnerValue, winnerExposure);
  const loserRate = getRate(loserValue, loserExposure);
  const winnerVariance = winnerExposure > 0 ? winnerRate / winnerExposure : 0;
  const loserVariance = loserExposure > 0 ? loserRate / loserExposure : 0;
  const standardError = Math.sqrt(winnerVariance + loserVariance);

  if (standardError <= EPSILON) {
    return 0.5;
  }

  return standardNormalCdf((winnerRate - loserRate) / standardError);
};

const confidenceForGaa = (winner: FinalsTeamData, loser: FinalsTeamData): number => {
  const winnerQualified = hasQualifiedGoalieRates(winner);
  const loserQualified = hasQualifiedGoalieRates(loser);

  if (winnerQualified !== loserQualified) {
    return qualificationConfidence(winnerQualified);
  }

  if (!winnerQualified && !loserQualified) {
    return 0.5;
  }

  const winnerGaa = winner.totals.gaa;
  const loserGaa = loser.totals.gaa;

  if (winnerGaa == null || loserGaa == null) {
    return 0.5;
  }

  if (winnerGaa <= EPSILON && loserGaa <= EPSILON) {
    return 0.5;
  }

  const winnerExposure = winner.playedGames.goalies;
  const loserExposure = loser.playedGames.goalies;
  const standardError = Math.sqrt(
    (winnerGaa / winnerExposure) + (loserGaa / loserExposure),
  );

  return standardNormalCdf((loserGaa - winnerGaa) / standardError);
};

const confidenceForSavePercent = (
  winner: FinalsTeamData,
  loser: FinalsTeamData,
): number => {
  const winnerQualified = hasQualifiedGoalieRates(winner);
  const loserQualified = hasQualifiedGoalieRates(loser);

  if (winnerQualified !== loserQualified) {
    return qualificationConfidence(winnerQualified);
  }

  if (!winnerQualified && !loserQualified) {
    return 0.5;
  }

  const winnerSavePercent = winner.totals.savePercent;
  const loserSavePercent = loser.totals.savePercent;

  if (winnerSavePercent == null || loserSavePercent == null) {
    return 0.5;
  }

  const winnerShotsAgainst = winnerSavePercent > 0
    ? winner.totals.saves / winnerSavePercent
    : 0;
  const loserShotsAgainst = loserSavePercent > 0
    ? loser.totals.saves / loserSavePercent
    : 0;

  if (winnerShotsAgainst <= 0 || loserShotsAgainst <= 0) {
    if (Math.abs(winnerSavePercent - loserSavePercent) < EPSILON) return 0.5;
    return winnerSavePercent > loserSavePercent ? 1 : 0;
  }

  const pooledSavePercent =
    (winner.totals.saves + loser.totals.saves) /
    (winnerShotsAgainst + loserShotsAgainst);
  if (pooledSavePercent <= EPSILON || pooledSavePercent >= 1 - EPSILON) {
    return 0.5;
  }

  const standardError = Math.sqrt(
    pooledSavePercent *
      (1 - pooledSavePercent) *
      ((1 / winnerShotsAgainst) + (1 / loserShotsAgainst)),
  );

  return standardNormalCdf(
    (winnerSavePercent - loserSavePercent) / standardError,
  );
};

const confidenceForPlusMinus = (
  winner: FinalsTeamData,
  loser: FinalsTeamData,
  scale: number,
): number => {
  const winnerRate = getRate(winner.totals.plusMinus, winner.playedGames.skaters);
  const loserRate = getRate(loser.totals.plusMinus, loser.playedGames.skaters);
  const effectiveScale = Math.max(scale, MIN_PLUS_MINUS_SCALE);

  if (Math.abs(winnerRate - loserRate) < EPSILON) {
    return 0.5;
  }

  return standardNormalCdf((winnerRate - loserRate) / effectiveScale);
};

const confidenceForCategory = (
  stat: FinalsStatKey,
  winner: FinalsTeamData,
  loser: FinalsTeamData,
  context: FinalsScoringContext,
): number => {
  if (stat === "gaa") return confidenceForGaa(winner, loser);
  if (stat === "savePercent") return confidenceForSavePercent(winner, loser);
  if (stat === "plusMinus") {
    return confidenceForPlusMinus(winner, loser, context.plusMinusRateScale);
  }

  return confidenceForCountRate(
    winner.totals[stat],
    loser.totals[stat],
    getExposure(winner, stat),
    getExposure(loser, stat),
  );
};

export const buildFinalsScoringContext = (
  matchups: ReadonlyArray<Pick<FinalsMatchupDbEntry, "awayTeam" | "homeTeam">>,
): FinalsScoringContext => {
  const plusMinusRates = matchups.flatMap(({ awayTeam, homeTeam }) => [
    getRate(awayTeam.totals.plusMinus, awayTeam.playedGames.skaters),
    getRate(homeTeam.totals.plusMinus, homeTeam.playedGames.skaters),
  ]);

  return {
    plusMinusRateScale: Math.max(
      sampleStdDev(plusMinusRates) * Math.SQRT2,
      MIN_PLUS_MINUS_SCALE,
    ),
  };
};

export const calculateWinRate = (
  matchup: Pick<FinalsMatchupDbEntry, "awayTeam" | "homeTeam">,
): number => {
  const { winner } = getWinnerAndLoser(matchup);
  const totalCategories =
    winner.score.categoriesWon +
    winner.score.categoriesLost +
    winner.score.categoriesTied;

  if (totalCategories <= 0) {
    return 0.5;
  }

  return toThreeDecimals(winner.score.matchPoints / totalCategories);
};

export const calculateWeightedEdgeRate = (
  matchup: Pick<
    FinalsMatchupDbEntry,
    "awayTeam" | "homeTeam" | "wonOnHomeTiebreak"
  >,
  weights: FinalsModelWeights,
  context: FinalsScoringContext,
): number => {
  const { winner, loser } = getWinnerAndLoser(matchup);

  let weightedScore = 0;
  let totalWeight = 0;

  for (const stat of Object.keys(weights) as FinalsStatKey[]) {
    const weight = weights[stat];
    if (!weight) continue;

    weightedScore += confidenceForCategory(stat, winner, loser, context) * weight;
    totalWeight += weight;
  }

  if (matchup.wonOnHomeTiebreak) {
    weightedScore +=
      FINALS_HOME_TIEBREAK_WINNER_CONFIDENCE * FINALS_HOME_TIEBREAK_WEIGHT;
    totalWeight += FINALS_HOME_TIEBREAK_WEIGHT;
  }

  if (totalWeight <= 0) {
    return 0.5;
  }

  return toThreeDecimals(weightedScore / totalWeight);
};

export const calculateFinalsFactors = (
  matchup: Pick<FinalsMatchupDbEntry, "awayTeam" | "homeTeam">,
): FinalsFactors => buildFactorSetPair(matchup.awayTeam, matchup.homeTeam);

/** @internal */
export const testOnlyToFactorPair = toFactorPair;
