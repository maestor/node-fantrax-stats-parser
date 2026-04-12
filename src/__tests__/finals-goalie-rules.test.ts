import {
  compareFinalGoalieRateWinner,
  deriveFallbackFinalGoalieGames,
  formatFinalGoalieGaa,
  formatFinalGoalieSavePercent,
} from "../playwright/finals-goalie-rules.js";

describe("finals goalie rules", () => {
  test("uses null goalie rates when a finalist does not reach two goalie games", () => {
    expect(formatFinalGoalieGaa(3.23, 1)).toBeNull();
    expect(formatFinalGoalieSavePercent(0.907, 1)).toBeNull();
    expect(formatFinalGoalieGaa(null, 0)).toBeNull();
    expect(formatFinalGoalieSavePercent(null, 0)).toBeNull();
  });

  test("formats goalie rates normally once the finalist reaches two goalie games", () => {
    expect(formatFinalGoalieGaa(3.234, 2)).toBe("3.23");
    expect(formatFinalGoalieSavePercent(0.9074, 2)).toBe("0.907");
  });

  test("falls back to one goalie game when saves exist but rate stats are missing", () => {
    expect(
      deriveFallbackFinalGoalieGames({ wins: 0, saves: 17, shutouts: 0 }),
    ).toBe(1);
  });

  test("awards goalie rate categories to the qualified team when only one finalist qualifies", () => {
    expect(
      compareFinalGoalieRateWinner("gaa", null, "3.23", 1, 3),
    ).toBe("home");
    expect(
      compareFinalGoalieRateWinner("savePercent", null, "0.907", 1, 3),
    ).toBe("home");
  });

  test("treats goalie rate categories as ties when neither finalist qualifies", () => {
    expect(compareFinalGoalieRateWinner("gaa", null, null, 1, 1)).toBe("tie");
    expect(
      compareFinalGoalieRateWinner("savePercent", null, null, 0, 1),
    ).toBe("tie");
  });
});
