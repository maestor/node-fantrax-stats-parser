import {
  getAvailableSeasons,
} from "../features/meta/service.js";
import {
  getGoaliesStatsCombined,
  getGoaliesStatsSeason,
  getPlayersStatsCombined,
  getPlayersStatsSeason,
} from "../features/stats/service.js";
import {
  applyGoalieScores,
  applyPlayerScores,
  applyPlayerScoresByPosition,
  sortItemsByStatField,
} from "../features/stats/scoring.js";
import {
  mapAvailableSeasons,
  mapCombinedGoalieDataFromGoaliesWithSeason,
  mapCombinedPlayerDataFromPlayersWithSeason,
} from "../features/stats/mapping.js";
import { getGoaliesFromDb, getPlayersFromDb } from "../db/queries.js";
import { availableSeasons as listAvailableSeasons } from "../shared/seasons.js";
import {
  mockGoalie,
  mockGoalieWithSeason,
  mockPlayer,
  mockPlayerWithSeason,
} from "./fixtures.js";

jest.mock("../features/stats/scoring");
jest.mock("../features/stats/mapping");
jest.mock("../db/queries");
jest.mock("../shared/seasons");

describe("services", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("season and combined stat services", () => {
    describe("getAvailableSeasons", () => {
      test("uses the default team and report when optional params are omitted", async () => {
        const mockSeasons = [
          { season: 2012, text: "2012-2013" },
          { season: 2013, text: "2013-2014" },
        ];

        (listAvailableSeasons as jest.Mock).mockReturnValue([2012, 2013]);
        (mapAvailableSeasons as jest.Mock).mockReturnValue(mockSeasons);

        const result = await getAvailableSeasons();

        expect(listAvailableSeasons).toHaveBeenCalledWith("1", "regular");
        expect(mapAvailableSeasons).toHaveBeenCalledWith([2012, 2013]);
        expect(result).toEqual(mockSeasons);
      });
    });

    describe("getPlayersStatsSeason", () => {
      beforeEach(() => {
        (listAvailableSeasons as jest.Mock).mockReturnValue([2012, 2013, 2024]);
        (getPlayersFromDb as jest.Mock).mockResolvedValue([mockPlayerWithSeason]);
        (applyPlayerScores as jest.Mock).mockImplementation((data) => data);
        (applyPlayerScoresByPosition as jest.Mock).mockImplementation(
          () => undefined,
        );
        (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);
      });

      test("returns empty array when season is undefined and no seasons are available", async () => {
        (listAvailableSeasons as jest.Mock).mockReturnValue([]);

        const result = await getPlayersStatsSeason("regular", undefined);

        expect(result).toEqual([]);
        expect(getPlayersFromDb).not.toHaveBeenCalled();
      });

      test("when reportType is both, queries regular+playoffs and merges before scoring", async () => {
        const regular = { ...mockPlayerWithSeason, games: 12, points: 6 };
        const playoffs = { ...mockPlayerWithSeason, games: 4, points: 3 };

        (getPlayersFromDb as jest.Mock)
          .mockResolvedValueOnce([regular])
          .mockResolvedValueOnce([playoffs]);

        await getPlayersStatsSeason("both", 2024);

        expect(getPlayersFromDb).toHaveBeenCalledWith("1", 2024, "regular");
        expect(getPlayersFromDb).toHaveBeenCalledWith("1", 2024, "playoffs");
        expect(applyPlayerScores).toHaveBeenCalledWith([
          expect.objectContaining({
            name: "Test Player",
            season: 2024,
            games: 16,
            points: 9,
          }),
        ]);
      });
    });

    describe("getGoaliesStatsSeason", () => {
      beforeEach(() => {
        (listAvailableSeasons as jest.Mock).mockReturnValue([2012, 2013, 2024]);
        (getGoaliesFromDb as jest.Mock).mockResolvedValue([mockGoalieWithSeason]);
        (applyGoalieScores as jest.Mock).mockImplementation((data) => data);
        (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);
      });

      test("when reportType is both, strips gaa/savePercent for merged goalies", async () => {
        const regular = {
          ...mockGoalieWithSeason,
          games: 10,
          wins: 6,
          gaa: "2.30",
          savePercent: "0.920",
        };
        const playoffs = {
          ...mockGoalieWithSeason,
          games: 2,
          wins: 1,
          gaa: "1.00",
          savePercent: "0.950",
        };

        (getGoaliesFromDb as jest.Mock)
          .mockResolvedValueOnce([regular])
          .mockResolvedValueOnce([playoffs]);

        await getGoaliesStatsSeason("both", 2024);

        expect(applyGoalieScores).toHaveBeenCalledWith([
          expect.objectContaining({
            name: "Test Goalie",
            season: 2024,
            games: 12,
            wins: 7,
            gaa: undefined,
            savePercent: undefined,
          }),
        ]);
      });
    });

    describe("getPlayersStatsCombined", () => {
      beforeEach(() => {
        (listAvailableSeasons as jest.Mock).mockReturnValue([2012, 2013, 2014]);
        (getPlayersFromDb as jest.Mock).mockResolvedValue([mockPlayerWithSeason]);
        (mapCombinedPlayerDataFromPlayersWithSeason as jest.Mock).mockReturnValue(
          [mockPlayer],
        );
        (applyPlayerScores as jest.Mock).mockImplementation((data) => data);
        (applyPlayerScoresByPosition as jest.Mock).mockImplementation(
          () => undefined,
        );
        (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);
      });

      test("returns empty array when no seasons are available", async () => {
        (listAvailableSeasons as jest.Mock).mockReturnValue([]);
        (mapCombinedPlayerDataFromPlayersWithSeason as jest.Mock).mockReturnValue(
          [],
        );

        const result = await getPlayersStatsCombined("regular");

        expect(result).toEqual([]);
        expect(getPlayersFromDb).not.toHaveBeenCalled();
      });

      test("returns empty array when startFrom is after all available seasons", async () => {
        (mapCombinedPlayerDataFromPlayersWithSeason as jest.Mock).mockReturnValue(
          [],
        );

        const result = await getPlayersStatsCombined("regular", "1", 2025);

        expect(listAvailableSeasons).toHaveBeenCalledWith("1", "regular");
        expect(result).toEqual([]);
      });
    });

    describe("getGoaliesStatsCombined", () => {
      beforeEach(() => {
        (listAvailableSeasons as jest.Mock).mockReturnValue([2012, 2013, 2014]);
        (getGoaliesFromDb as jest.Mock).mockResolvedValue([mockGoalieWithSeason]);
        (mapCombinedGoalieDataFromGoaliesWithSeason as jest.Mock).mockReturnValue(
          [mockGoalie],
        );
        (applyGoalieScores as jest.Mock).mockImplementation((data) => data);
        (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);
      });

      test("uses the default team when startFrom is omitted", async () => {
        const result = await getGoaliesStatsCombined("regular");

        expect(listAvailableSeasons).toHaveBeenCalledWith("1", "regular");
        expect(getGoaliesFromDb).toHaveBeenCalledTimes(3);
        expect(result).toEqual([mockGoalie]);
      });

      test("filters seasons when startFrom is provided", async () => {
        (listAvailableSeasons as jest.Mock).mockReturnValue([
          2012, 2013, 2014, 2020,
        ]);

        const result = await getGoaliesStatsCombined("regular", "1", 2020);

        expect(listAvailableSeasons).toHaveBeenCalledWith("1", "regular");
        expect(getGoaliesFromDb).toHaveBeenCalledTimes(1);
        expect(getGoaliesFromDb).toHaveBeenCalledWith("1", 2020, "regular");
        expect(result).toEqual([mockGoalie]);
      });

      test("returns empty array when startFrom is after all available seasons", async () => {
        (mapCombinedGoalieDataFromGoaliesWithSeason as jest.Mock).mockReturnValue(
          [],
        );

        const result = await getGoaliesStatsCombined("regular", "1", 2025);

        expect(listAvailableSeasons).toHaveBeenCalledWith("1", "regular");
        expect(result).toEqual([]);
      });
    });
  });
});
