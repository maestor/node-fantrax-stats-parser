import { scrapeChampionFromBracket } from "../playwright/helpers.js";

type MockLocator = {
  allInnerTexts: jest.Mock<Promise<string[]>, []>;
};

type MockPage = {
  waitForFunction: jest.Mock<Promise<void>, unknown[]>;
  locator: jest.Mock<MockLocator, [string]>;
};

const CHAMPION_SELECTOR =
  ".league-playoff-tree__cell--champion .league-playoff-tree__cell__team";
const CHAMPION_CELL_SELECTOR = ".league-playoff-tree__cell--champion";

const createMockPage = (textsBySelector: Record<string, string[]>): MockPage => {
  const locatorBySelector = new Map<string, MockLocator>(
    Object.entries(textsBySelector).map(([selector, texts]) => [
      selector,
      {
        allInnerTexts: jest.fn().mockResolvedValue(texts),
      },
    ]),
  );

  return {
    waitForFunction: jest.fn().mockResolvedValue(undefined),
    locator: jest.fn((selector: string) => {
      return (
        locatorBySelector.get(selector) ?? {
          allInnerTexts: jest.fn().mockResolvedValue([]),
        }
      );
    }),
  };
};

describe("playwright helpers", () => {
  describe("scrapeChampionFromBracket", () => {
    test("returns the champion from the dedicated team node when it has text", async () => {
      const page = createMockPage({
        [CHAMPION_SELECTOR]: ["Edmonton Oilers"],
      });

      await expect(scrapeChampionFromBracket(page as never)).resolves.toBe(
        "Edmonton Oilers",
      );

      expect(page.waitForFunction).toHaveBeenCalledTimes(1);
      expect(page.locator).toHaveBeenCalledWith(CHAMPION_SELECTOR);
    });

    test("falls back to the champion cell and strips a leading score", async () => {
      const page = createMockPage({
        [CHAMPION_SELECTOR]: [""],
        [CHAMPION_CELL_SELECTOR]: ["11.5 Edmonton Oilers"],
      });

      await expect(scrapeChampionFromBracket(page as never)).resolves.toBe(
        "Edmonton Oilers",
      );

      expect(page.locator).toHaveBeenCalledWith(CHAMPION_CELL_SELECTOR);
    });

    test("returns null when no champion text is available", async () => {
      const page = createMockPage({
        [CHAMPION_SELECTOR]: [""],
        [CHAMPION_CELL_SELECTOR]: [],
      });
      page.waitForFunction.mockRejectedValueOnce(new Error("timed out"));

      await expect(scrapeChampionFromBracket(page as never)).resolves.toBeNull();
    });
  });
});
