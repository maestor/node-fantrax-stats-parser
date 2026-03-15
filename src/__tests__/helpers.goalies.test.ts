import { MIN_GAMES_FOR_ADJUSTED_SCORE } from "../config";
import { applyGoalieScores } from "../features/stats/scoring";
import { createGoalie } from "./fixtures";

const expectScoreInRange = (value: number | undefined): void => {
  expect(value).toBeDefined();
  expect(value).toBeGreaterThanOrEqual(0);
  expect(value).toBeLessThanOrEqual(100);
};

describe("helpers goalie scoring", () => {
  describe("applyGoalieScores", () => {
    test("scores goalies between 0 and 100 and populates per-stat scores", () => {
      const [high, half] = applyGoalieScores([
        createGoalie({ name: "Goalie High", wins: 40 }),
        createGoalie({ name: "Goalie Half", wins: 20 }),
      ]);

      expectScoreInRange(high.score);
      expectScoreInRange(half.score);
      expect(high.scores?.wins).toBe(100);
      expect(half.scores?.wins).toBeCloseTo(70.71, 2);
      expect(high.score).toBe(100);
      expect(high.score).toBeGreaterThan(half.score as number);
      expect(Number((high.score as number).toFixed(2))).toBe(high.score);
    });

    test("returns empty arrays unchanged", () => {
      expect(applyGoalieScores([])).toEqual([]);
    });

    test("keeps adjusted scoring at zero for eligible goalies with no base stats", () => {
      const [goalie] = applyGoalieScores([
        createGoalie({
          name: "Zero Stats Goalie",
          games: MIN_GAMES_FOR_ADJUSTED_SCORE,
        }),
      ]);

      expect(goalie.scoreAdjustedByGames).toBe(0);
    });

    test("zeros adjusted scores below the minimum games threshold", () => {
      const belowMinGames = Math.max(MIN_GAMES_FOR_ADJUSTED_SCORE - 1, 0);
      const [fewGames, eligible] = applyGoalieScores([
        createGoalie({
          name: "Few Games Goalie",
          games: belowMinGames,
          wins: 5,
          saves: 200,
          shutouts: 1,
        }),
        createGoalie({
          name: "Eligible Goalie",
          games: MIN_GAMES_FOR_ADJUSTED_SCORE,
          wins: 5,
          saves: 200,
          shutouts: 1,
        }),
      ]);

      expect(fewGames.scoreAdjustedByGames).toBe(0);
      expect(eligible.scoreAdjustedByGames).toBeGreaterThan(0);
    });

    test("lets better pace outrank higher totals in games-adjusted scoring", () => {
      const [higherPace, higherTotals] = applyGoalieScores([
        createGoalie({
          name: "Higher Pace Goalie",
          games: 20,
          wins: 10,
          saves: 600,
          shutouts: 2,
        }),
        createGoalie({
          name: "Higher Totals Goalie",
          games: 40,
          wins: 14,
          saves: 1000,
          shutouts: 3,
        }),
      ]);

      expect(higherPace.score).toBeLessThan(higherTotals.score as number);
      expect(higherPace.scoreAdjustedByGames).toBeGreaterThan(
        higherTotals.scoreAdjustedByGames as number,
      );
    });

    test("zeros adjusted scores when nobody is eligible", () => {
      const belowMinGames = Math.max(MIN_GAMES_FOR_ADJUSTED_SCORE - 1, 0);
      const result = applyGoalieScores([
        createGoalie({
          name: "Under Min Goalie A",
          games: belowMinGames,
          wins: 2,
          saves: 50,
        }),
        createGoalie({
          name: "Under Min Goalie B",
          games: belowMinGames,
          wins: 3,
          saves: 60,
          shutouts: 1,
        }),
      ]);

      expect(result.every((goalie) => goalie.scoreAdjustedByGames === 0)).toBe(
        true,
      );
    });

    test("uses a zero baseline for goalie positive stats", () => {
      const [top, zero, lowest] = applyGoalieScores([
        createGoalie({ name: "Top Goalie", wins: 40 }),
        createGoalie({ name: "Zero Wins" }),
        createGoalie({ name: "Lowest With Wins", wins: 3 }),
      ]);

      expect(zero.score).toBe(0);
      expect(lowest.score).toBeGreaterThan(0);
      expect(top.score).toBeGreaterThan(lowest.score as number);
    });

    test("keeps equal positive values equal and non-zero", () => {
      const [one, two] = applyGoalieScores([
        createGoalie({ name: "Goalie One", wins: 10 }),
        createGoalie({ name: "Goalie Two", wins: 10 }),
      ]);

      expect(one.score).toBe(two.score);
      expect(one.score).toBeGreaterThan(0);
    });

    test("uses full savePercent contribution when all valid values are equal", () => {
      const [one, two] = applyGoalieScores([
        createGoalie({ name: "Equal A", savePercent: "0.920" }),
        createGoalie({ name: "Equal B", savePercent: "0.920" }),
      ]);

      expect(one.scores?.savePercent).toBe(100);
      expect(two.scores?.savePercent).toBe(100);
      expect(one.score).toBe(two.score);
      expect(one.score).toBe(100);
    });

    test("drops savePercent contribution to zero below the baseline", () => {
      const [above, below] = applyGoalieScores([
        createGoalie({ name: "Above Baseline", savePercent: "0.900" }),
        createGoalie({ name: "Below Baseline", savePercent: "0.840" }),
      ]);

      expect(above.scores?.savePercent).toBeGreaterThan(0);
      expect(below.scores?.savePercent).toBe(0);
    });

    test("scores savePercent at zero when all values are at or below baseline", () => {
      const [goalieA, goalieB] = applyGoalieScores([
        createGoalie({
          name: "Goalie A",
          wins: 5,
          saves: 100,
          savePercent: "0.840",
        }),
        createGoalie({
          name: "Goalie B",
          wins: 3,
          saves: 80,
          savePercent: "0.830",
        }),
      ]);

      expect(goalieA.scores?.savePercent).toBe(0);
      expect(goalieB.scores?.savePercent).toBe(0);
    });

    test("handles savePercent and GAA contributions when present or invalid", () => {
      const [best, slightlyWorseGaa, worseAdvanced, invalidAdvanced, noAdvanced] =
        applyGoalieScores([
          createGoalie({
            name: "Goalie Best",
            wins: 10,
            savePercent: "0.930",
            gaa: "2.0",
          }),
          createGoalie({
            name: "Goalie Slightly Worse GAA",
            wins: 10,
            savePercent: "0.925",
            gaa: "2.4",
          }),
          createGoalie({
            name: "Goalie Worse Advanced",
            wins: 10,
            savePercent: "0.910",
            gaa: "3.0",
          }),
          createGoalie({
            name: "Goalie Invalid Advanced",
            wins: 10,
            savePercent: "not-a-number",
            gaa: "not-a-number",
          }),
          createGoalie({ name: "Goalie No Advanced", wins: 10 }),
        ]);

      expect(best.scores?.savePercent).toBe(100);
      expect(best.scores?.gaa).toBe(100);
      expect(slightlyWorseGaa.scores?.gaa).toBeLessThan(100);
      expect(slightlyWorseGaa.scores?.gaa).toBeGreaterThan(0);
      expect(worseAdvanced.scores?.savePercent).toBeLessThan(
        slightlyWorseGaa.scores?.savePercent as number,
      );
      expect(invalidAdvanced.scores?.savePercent).toBeUndefined();
      expect(invalidAdvanced.scores?.gaa).toBeUndefined();
      expect(noAdvanced.scores?.savePercent).toBeUndefined();
      expect(noAdvanced.scores?.gaa).toBeUndefined();
      expectScoreInRange(best.score);
      expectScoreInRange(slightlyWorseGaa.score);
      expectScoreInRange(worseAdvanced.score);
      expectScoreInRange(invalidAdvanced.score);
      expectScoreInRange(noAdvanced.score);
    });

    test("sets score to zero when there are no contributing metrics", () => {
      const [goalie] = applyGoalieScores([
        createGoalie({ name: "Goalie No Metrics", score: 5 }),
      ]);

      expect(goalie.score).toBe(0);
    });

    test("zeros GAA contribution once the ratio exceeds the max difference", () => {
      const [best, extreme] = applyGoalieScores([
        createGoalie({
          name: "Goalie Best GAA",
          games: 30,
          wins: 20,
          saves: 800,
          shutouts: 3,
          gaa: "2.0",
          savePercent: "0.920",
        }),
        createGoalie({
          name: "Goalie Extreme GAA",
          games: 30,
          wins: 10,
          saves: 600,
          shutouts: 1,
          gaa: "4.0",
          savePercent: "0.880",
        }),
      ]);

      expect(best.scores?.gaa).toBe(100);
      expect(extreme.scores?.gaa).toBe(0);
    });
  });
});
