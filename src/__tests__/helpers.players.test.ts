import { MIN_GAMES_FOR_ADJUSTED_SCORE } from "../config";
import {
  applyPlayerScores,
  applyPlayerScoresByPosition,
} from "../features/stats/scoring";
import { createPlayer } from "./fixtures";

const expectScoreInRange = (value: number | undefined): void => {
  expect(value).toBeDefined();
  expect(value).toBeGreaterThanOrEqual(0);
  expect(value).toBeLessThanOrEqual(100);
};

describe("helpers player scoring", () => {
  describe("applyPlayerScores", () => {
    test("scores players between 0 and 100 and populates per-stat scores", () => {
      const [high, half] = applyPlayerScores([
        createPlayer({ name: "Player High", goals: 50 }),
        createPlayer({ name: "Player Half", goals: 25 }),
      ]);

      expectScoreInRange(high.score);
      expectScoreInRange(half.score);
      expect(high.scores?.goals).toBe(100);
      expect(half.scores?.goals).toBe(50);
      expect(high.score).toBe(100);
      expect(high.score).toBeGreaterThan(half.score as number);
      expect(Number((high.score as number).toFixed(2))).toBe(high.score);
    });

    test("returns empty arrays unchanged", () => {
      expect(applyPlayerScores([])).toEqual([]);
    });

    test("zeros adjusted scores below the minimum games threshold", () => {
      const belowMinGames = Math.max(MIN_GAMES_FOR_ADJUSTED_SCORE - 1, 0);
      const [fewGames, eligible] = applyPlayerScores([
        createPlayer({ name: "Few Games", games: belowMinGames, goals: 5 }),
        createPlayer({ name: "Eligible", games: MIN_GAMES_FOR_ADJUSTED_SCORE, goals: 5 }),
      ]);

      expect(fewGames.scoreAdjustedByGames).toBe(0);
      expect(eligible.scoreAdjustedByGames).toBeGreaterThan(0);
    });

    test("zeros adjusted scores when nobody is eligible", () => {
      const belowMinGames = Math.max(MIN_GAMES_FOR_ADJUSTED_SCORE - 1, 0);
      const result = applyPlayerScores([
        createPlayer({ games: belowMinGames, goals: 5, assists: 3, points: 8, plusMinus: 2, penalties: 1, shots: 10, ppp: 1, hits: 2, blocks: 1 }),
        createPlayer({ games: belowMinGames, goals: 4, assists: 2, points: 6, plusMinus: -1, penalties: 2, shots: 8, ppp: 1, hits: 1 }),
      ]);

      expect(result.every((player) => player.scoreAdjustedByGames === 0)).toBe(
        true,
      );
    });

    test("lets better pace outrank higher totals in games-adjusted scoring", () => {
      const [higherPace, higherTotals] = applyPlayerScores([
        createPlayer({
          name: "Higher Pace",
          games: 20,
          goals: 10,
          assists: 14,
          points: 24,
          plusMinus: 6,
          penalties: 20,
          shots: 70,
          ppp: 6,
          hits: 20,
          blocks: 14,
        }),
        createPlayer({
          name: "Higher Totals",
          games: 40,
          goals: 14,
          assists: 18,
          points: 32,
          plusMinus: 8,
          penalties: 24,
          shots: 100,
          ppp: 8,
          hits: 28,
          blocks: 20,
        }),
      ]);

      expect(higherPace.score).toBeLessThan(higherTotals.score as number);
      expect(higherPace.scoreAdjustedByGames).toBeGreaterThan(
        higherTotals.scoreAdjustedByGames as number,
      );
    });

    test("uses a zero baseline for always-positive stats", () => {
      const [top, zero, lowest] = applyPlayerScores([
        createPlayer({ name: "Top", goals: 40 }),
        createPlayer({ name: "Zero Goals" }),
        createPlayer({ name: "Lowest With Goals", goals: 3 }),
      ]);

      expect(zero.score).toBe(0);
      expect(lowest.score).toBeGreaterThan(0);
      expect(top.score).toBeGreaterThan(lowest.score as number);
    });

    test("keeps equal positive values equal and non-zero", () => {
      const [one, two] = applyPlayerScores([
        createPlayer({ name: "Player One", goals: 10 }),
        createPlayer({ name: "Player Two", goals: 10 }),
      ]);

      expect(one.score).toBe(two.score);
      expect(one.score).toBeGreaterThan(0);
    });

    test("maps plusMinus linearly between the minimum and maximum", () => {
      const [best, worst, middle] = applyPlayerScores([
        createPlayer({ name: "Best", plusMinus: 20 }),
        createPlayer({ name: "Worst", plusMinus: -10 }),
        createPlayer({ name: "Middle", plusMinus: 5 }),
      ]);

      expectScoreInRange(best.score);
      expectScoreInRange(middle.score);
      expectScoreInRange(worst.score);
      expect(best.score).toBeGreaterThan(middle.score as number);
      expect(middle.score).toBeGreaterThan(worst.score as number);
    });

    test("keeps equal plusMinus values tied at the same score", () => {
      const [one, two] = applyPlayerScores([
        createPlayer({ name: "Equal A", plusMinus: 5 }),
        createPlayer({ name: "Equal B", plusMinus: 5 }),
      ]);

      expect(one.score).toBe(two.score);
      expect(one.score).toBe(100);
    });

    test("uses stabilized plusMinus rates in games-adjusted scoring", () => {
      const [best, middle, worst] = applyPlayerScores([
        createPlayer({
          name: "Best PlusMinus",
          games: MIN_GAMES_FOR_ADJUSTED_SCORE,
          plusMinus: 20,
        }),
        createPlayer({
          name: "Middle PlusMinus",
          games: MIN_GAMES_FOR_ADJUSTED_SCORE,
          plusMinus: 5,
        }),
        createPlayer({
          name: "Worst PlusMinus",
          games: MIN_GAMES_FOR_ADJUSTED_SCORE,
          plusMinus: -10,
        }),
      ]);

      expectScoreInRange(best.scoreAdjustedByGames);
      expectScoreInRange(middle.scoreAdjustedByGames);
      expectScoreInRange(worst.scoreAdjustedByGames);
      expect(best.scoreAdjustedByGames).toBe(100);
      expect(best.scoreAdjustedByGames).toBeGreaterThan(
        middle.scoreAdjustedByGames as number,
      );
      expect(middle.scoreAdjustedByGames).toBeGreaterThan(
        worst.scoreAdjustedByGames as number,
      );
    });

    test("dampens SHP spikes in games-adjusted scoring", () => {
      const [oneGameHero, steadyProducer, noShp] = applyPlayerScores([
        createPlayer({ name: "One Game Hero", games: 1, shp: 1 }),
        createPlayer({ name: "Steady Producer", games: 20, shp: 2 }),
        createPlayer({ name: "No SHP", games: 20 }),
      ]);

      expect(oneGameHero.scoreAdjustedByGames).toBe(100);
      expect(steadyProducer.scoreAdjustedByGames).toBeGreaterThan(50);
      expect(noShp.scoreAdjustedByGames).toBe(0);
    });

    test("keeps adjusted scoring at zero when every eligible player has zero stats", () => {
      const result = applyPlayerScores([
        createPlayer({ games: MIN_GAMES_FOR_ADJUSTED_SCORE }),
        createPlayer({ games: MIN_GAMES_FOR_ADJUSTED_SCORE + 1 }),
      ]);

      expect(result.every((player) => player.scoreAdjustedByGames === 0)).toBe(
        true,
      );
    });

    test("treats NaN values as zero", () => {
      const [nanPlayer, validPlayer] = applyPlayerScores([
        createPlayer({ name: "NaN Player", goals: Number.NaN }),
        createPlayer({ name: "Valid Player", goals: 10 }),
      ]);

      expectScoreInRange(nanPlayer.score);
      expectScoreInRange(validPlayer.score);
    });
  });

  describe("applyPlayerScoresByPosition", () => {
    test("returns empty arrays unchanged", () => {
      expect(applyPlayerScoresByPosition([])).toEqual([]);
    });

    test("scores each position group against itself", () => {
      const result = applyPlayerScoresByPosition([
        createPlayer({
          name: "Forward High",
          position: "F",
          games: 10,
          goals: 20,
          assists: 30,
          points: 50,
          plusMinus: 10,
          penalties: 5,
          shots: 100,
          ppp: 10,
          shp: 2,
          hits: 20,
          blocks: 5,
        }),
        createPlayer({
          name: "Forward Low",
          position: "F",
          games: 10,
          goals: 10,
          assists: 15,
          points: 25,
          plusMinus: 5,
          penalties: 10,
          shots: 50,
          ppp: 5,
          shp: 1,
          hits: 10,
          blocks: 3,
        }),
        createPlayer({
          name: "Defenseman",
          position: "D",
          games: 10,
          goals: 5,
          assists: 10,
          points: 15,
          plusMinus: 15,
          penalties: 2,
          shots: 30,
          ppp: 3,
          hits: 50,
          blocks: 40,
        }),
      ]);

      expect(result[0].scoreByPosition).toBe(100);
      expect(result[0].scoresByPosition).toBeDefined();
      expect(result[0].scoreByPositionAdjustedByGames).toBeDefined();
      expect(result[1].scoreByPosition).toBeGreaterThan(0);
      expect(result[1].scoreByPosition).toBeLessThan(100);
      expect(result[2].scoreByPosition).toBe(100);
    });

    test("leaves players without a supported position unscored", () => {
      const [player] = applyPlayerScoresByPosition([
        createPlayer({ name: "No Position Player", games: 10, goals: 10, assists: 10, points: 20, shots: 50 }),
      ]);

      expect(player.scoreByPosition).toBeUndefined();
    });

    test("zeros position-adjusted scores below the minimum games threshold", () => {
      const belowMinGames = Math.max(MIN_GAMES_FOR_ADJUSTED_SCORE - 1, 0);
      const [fewGames, eligible] = applyPlayerScoresByPosition([
        createPlayer({
          name: "Few Games Forward",
          position: "F",
          games: belowMinGames,
          goals: 10,
          assists: 10,
          points: 20,
          shots: 50,
        }),
        createPlayer({
          name: "Eligible Forward",
          position: "F",
          games: MIN_GAMES_FOR_ADJUSTED_SCORE,
          goals: 10,
          assists: 10,
          points: 20,
          shots: 50,
        }),
      ]);

      expect(fewGames.scoreByPositionAdjustedByGames).toBe(0);
      expect(eligible.scoreByPositionAdjustedByGames).toBeGreaterThan(0);
    });

    test("keeps pace scoring within the same position group", () => {
      const [higherPace, higherTotals] = applyPlayerScoresByPosition([
        createPlayer({
          name: "Higher Pace Forward",
          position: "F",
          games: 20,
          goals: 10,
          assists: 14,
          points: 24,
          plusMinus: 6,
          penalties: 20,
          shots: 70,
          ppp: 6,
          hits: 20,
          blocks: 14,
        }),
        createPlayer({
          name: "Higher Totals Forward",
          position: "F",
          games: 40,
          goals: 14,
          assists: 18,
          points: 32,
          plusMinus: 8,
          penalties: 24,
          shots: 100,
          ppp: 8,
          hits: 28,
          blocks: 20,
        }),
      ]);

      expect(higherPace.scoreByPosition).toBeLessThan(
        higherTotals.scoreByPosition as number,
      );
      expect(higherPace.scoreByPositionAdjustedByGames).toBeGreaterThan(
        higherTotals.scoreByPositionAdjustedByGames as number,
      );
    });

    test("zeros position-adjusted scores when a whole group is below the minimum", () => {
      const belowMinGames = Math.max(MIN_GAMES_FOR_ADJUSTED_SCORE - 1, 0);
      const result = applyPlayerScoresByPosition([
        createPlayer({
          position: "F",
          games: belowMinGames,
          goals: 10,
          assists: 10,
          points: 20,
          shots: 50,
        }),
        createPlayer({
          position: "F",
          games: belowMinGames,
          goals: 5,
          assists: 5,
          points: 10,
          shots: 25,
        }),
      ]);

      expect(result[0].scoreByPositionAdjustedByGames).toBe(0);
      expect(result[1].scoreByPositionAdjustedByGames).toBe(0);
    });

    test("keeps equal plusMinus values from affecting position scores", () => {
      const [one, two] = applyPlayerScoresByPosition([
        createPlayer({
          name: "Forward 1",
          position: "F",
          games: 10,
          goals: 10,
          assists: 10,
          points: 20,
          plusMinus: 5,
          shots: 50,
        }),
        createPlayer({
          name: "Forward 2",
          position: "F",
          games: 10,
          goals: 10,
          assists: 10,
          points: 20,
          plusMinus: 5,
          shots: 50,
        }),
      ]);

      expect(one.scoreByPosition).toBe(two.scoreByPosition);
    });

    test("treats NaN values as zero in position scoring", () => {
      const [nanPlayer, validPlayer] = applyPlayerScoresByPosition([
        createPlayer({
          name: "NaN Forward",
          position: "F",
          games: 10,
          goals: Number.NaN,
          assists: 10,
          points: 10,
          shots: 50,
        }),
        createPlayer({
          name: "Valid Forward",
          position: "F",
          games: 10,
          goals: 10,
          assists: 10,
          points: 20,
          shots: 50,
        }),
      ]);

      expectScoreInRange(nanPlayer.scoreByPosition);
      expectScoreInRange(validPlayer.scoreByPosition);
    });

    test("keeps negative plusMinus values lower in position-adjusted scoring", () => {
      const [positive, negative] = applyPlayerScoresByPosition([
        createPlayer({
          name: "Positive Forward",
          position: "F",
          games: 10,
          goals: 10,
          assists: 10,
          points: 20,
          plusMinus: 20,
          shots: 50,
        }),
        createPlayer({
          name: "Negative Forward",
          position: "F",
          games: 10,
          goals: 5,
          assists: 5,
          points: 10,
          plusMinus: -15,
          shots: 25,
        }),
      ]);

      expect(positive.scoreByPositionAdjustedByGames).toBeGreaterThan(
        negative.scoreByPositionAdjustedByGames as number,
      );
    });

    test("keeps zero-stat groups defined at zero", () => {
      const [one, two] = applyPlayerScoresByPosition([
        createPlayer({ name: "Zero Forward 1", position: "F", games: 1 }),
        createPlayer({ name: "Zero Forward 2", position: "F", games: 1 }),
      ]);

      expect(one.scoreByPosition).toBe(0);
      expect(two.scoreByPosition).toBe(0);
    });
  });
});
