import {
  getAvailableSeasons,
  getPlayersStatsSeason,
  getGoaliesStatsSeason,
  getPlayersStatsCombined,
  getGoaliesStatsCombined,
} from "../services";
import {
  availableSeasons,
  sortItemsByStatField,
  applyPlayerScores,
  applyPlayerScoresByPosition,
  applyGoalieScores,
} from "../helpers";
import {
  mapAvailableSeasons,
  mapCombinedPlayerDataFromPlayersWithSeason,
  mapCombinedGoalieDataFromGoaliesWithSeason,
} from "../mappings";
import { getPlayersFromDb, getGoaliesFromDb } from "../db/queries";
import { mockPlayer, mockGoalie, mockPlayerWithSeason, mockGoalieWithSeason } from "./fixtures";

jest.mock("../helpers");
jest.mock("../mappings");
jest.mock("../db/queries");

describe("services", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getAvailableSeasons", () => {
    test("calls and returns mapAvailableSeasons result", async () => {
      const mockSeasons = [
        { season: 2012, text: "2012-2013" },
        { season: 2013, text: "2013-2014" },
      ];
      (availableSeasons as jest.Mock).mockReturnValue([2012, 2013]);
      (mapAvailableSeasons as jest.Mock).mockReturnValue(mockSeasons);

      const result = await getAvailableSeasons();

      expect(availableSeasons).toHaveBeenCalledWith("1", "regular");
      expect(mapAvailableSeasons).toHaveBeenCalledWith([2012, 2013]);
      expect(result).toEqual(mockSeasons);
    });

    test("filters seasons when startFrom is provided", async () => {
      const mockSeasons = [{ season: 2020, text: "2020-2021" }];
      (availableSeasons as jest.Mock).mockReturnValue([2012, 2013, 2020]);
      (mapAvailableSeasons as jest.Mock).mockReturnValue(mockSeasons);

      const result = await getAvailableSeasons("1", "regular", 2020);

      expect(availableSeasons).toHaveBeenCalledWith("1", "regular");
      expect(mapAvailableSeasons).toHaveBeenCalledWith([2020]);
      expect(result).toEqual(mockSeasons);
    });

    test("returns all seasons when startFrom is undefined", async () => {
      const mockSeasons = [
        { season: 2012, text: "2012-2013" },
        { season: 2013, text: "2013-2014" },
      ];
      (availableSeasons as jest.Mock).mockReturnValue([2012, 2013]);
      (mapAvailableSeasons as jest.Mock).mockReturnValue(mockSeasons);

      const result = await getAvailableSeasons("1", "regular", undefined);

      expect(availableSeasons).toHaveBeenCalledWith("1", "regular");
      expect(mapAvailableSeasons).toHaveBeenCalledWith([2012, 2013]);
      expect(result).toEqual(mockSeasons);
    });

    test("returns empty array when startFrom is after all available seasons", async () => {
      const mockSeasons: Array<{ season: number; text: string }> = [];
      (availableSeasons as jest.Mock).mockReturnValue([2012, 2013]);
      (mapAvailableSeasons as jest.Mock).mockReturnValue(mockSeasons);

      const result = await getAvailableSeasons("1", "regular", 2025);

      expect(availableSeasons).toHaveBeenCalledWith("1", "regular");
      expect(mapAvailableSeasons).toHaveBeenCalledWith([]);
      expect(result).toEqual(mockSeasons);
    });

    test("uses regular report type when reportType is both", async () => {
      const mockSeasons = [{ season: 2012, text: "2012-2013" }];
      (availableSeasons as jest.Mock).mockReturnValue([2012]);
      (mapAvailableSeasons as jest.Mock).mockReturnValue(mockSeasons);

      const result = await getAvailableSeasons("1", "both");

      expect(availableSeasons).toHaveBeenCalledWith("1", "regular");
      expect(result).toEqual(mockSeasons);
    });
  });

  describe("getPlayersStatsSeason", () => {
    beforeEach(() => {
      (availableSeasons as jest.Mock).mockReturnValue([2012, 2013, 2024]);
      (getPlayersFromDb as jest.Mock).mockResolvedValue([mockPlayerWithSeason]);
      (applyPlayerScores as jest.Mock).mockImplementation((data) => data);
      (applyPlayerScoresByPosition as jest.Mock).mockImplementation(() => {});
      (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);
    });

    test("fetches player stats from DB and sorts", async () => {
      const result = await getPlayersStatsSeason("regular", 2024);

      expect(getPlayersFromDb).toHaveBeenCalledWith("1", 2024, "regular");
      expect(applyPlayerScores).toHaveBeenCalled();
      expect(sortItemsByStatField).toHaveBeenCalledWith([mockPlayerWithSeason], "players");
      expect(result).toEqual([mockPlayerWithSeason]);
    });

    test("uses max season when season is undefined", async () => {
      await getPlayersStatsSeason("regular", undefined);

      expect(getPlayersFromDb).toHaveBeenCalledWith("1", 2024, "regular");
    });

    test("returns empty array when season is undefined and no seasons are available", async () => {
      (availableSeasons as jest.Mock).mockReturnValue([]);
      (applyPlayerScores as jest.Mock).mockImplementation((data) => data);
      (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);

      const result = await getPlayersStatsSeason("regular", undefined);

      expect(result).toEqual([]);
      expect(getPlayersFromDb).not.toHaveBeenCalled();
    });

    test("queries correct report type", async () => {
      await getPlayersStatsSeason("playoffs", 2023);

      expect(getPlayersFromDb).toHaveBeenCalledWith("1", 2023, "playoffs");
    });

    test("when reportType is both, queries regular+playoffs and merges before scoring", async () => {
      const regular = { ...mockPlayerWithSeason, games: 12, points: 6 };
      const playoffs = { ...mockPlayerWithSeason, games: 4, points: 3 };

      (getPlayersFromDb as jest.Mock)
        .mockResolvedValueOnce([regular]) // regular
        .mockResolvedValueOnce([playoffs]); // playoffs

      await getPlayersStatsSeason("both", 2024);

      expect(getPlayersFromDb).toHaveBeenCalledWith("1", 2024, "regular");
      expect(getPlayersFromDb).toHaveBeenCalledWith("1", 2024, "playoffs");

      expect(applyPlayerScores).toHaveBeenCalledWith([
        expect.objectContaining({ name: "Test Player", season: 2024, games: 16, points: 9 }),
      ]);
    });
  });

  describe("getGoaliesStatsSeason", () => {
    beforeEach(() => {
      (availableSeasons as jest.Mock).mockReturnValue([2012, 2013, 2024]);
      (getGoaliesFromDb as jest.Mock).mockResolvedValue([mockGoalieWithSeason]);
      (applyGoalieScores as jest.Mock).mockImplementation((data) => data);
      (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);
    });

    test("fetches goalie stats from DB and sorts", async () => {
      const result = await getGoaliesStatsSeason("regular", 2024);

      expect(getGoaliesFromDb).toHaveBeenCalledWith("1", 2024, "regular");
      expect(applyGoalieScores).toHaveBeenCalled();
      expect(sortItemsByStatField).toHaveBeenCalledWith([mockGoalieWithSeason], "goalies");
      expect(result).toEqual([mockGoalieWithSeason]);
    });

    test("uses max season when season is undefined", async () => {
      await getGoaliesStatsSeason("regular", undefined);

      expect(getGoaliesFromDb).toHaveBeenCalledWith("1", 2024, "regular");
    });

    test("when reportType is both, strips gaa/savePercent for merged goalies", async () => {
      const regular = { ...mockGoalieWithSeason, games: 10, wins: 6, gaa: "2.30", savePercent: "0.920" };
      const playoffs = { ...mockGoalieWithSeason, games: 2, wins: 1, gaa: "1.00", savePercent: "0.950" };

      (getGoaliesFromDb as jest.Mock)
        .mockResolvedValueOnce([regular]) // regular
        .mockResolvedValueOnce([playoffs]); // playoffs

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
      (availableSeasons as jest.Mock).mockReturnValue([2012, 2013, 2014]);
      (getPlayersFromDb as jest.Mock).mockResolvedValue([mockPlayerWithSeason]);
      (mapCombinedPlayerDataFromPlayersWithSeason as jest.Mock).mockReturnValue([mockPlayer]);
      (applyPlayerScores as jest.Mock).mockImplementation((data) => data);
      (applyPlayerScoresByPosition as jest.Mock).mockImplementation(() => {});
      (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);
    });

    test("fetches player stats for all available seasons", async () => {
      const result = await getPlayersStatsCombined("regular");

      expect(availableSeasons).toHaveBeenCalledWith("1", "regular");
      expect(getPlayersFromDb).toHaveBeenCalledTimes(3);
      expect(mapCombinedPlayerDataFromPlayersWithSeason).toHaveBeenCalled();
      expect(sortItemsByStatField).toHaveBeenCalledWith([mockPlayer], "players");
      expect(result).toEqual([mockPlayer]);
    });

    test("queries DB for each season", async () => {
      await getPlayersStatsCombined("regular");

      expect(getPlayersFromDb).toHaveBeenCalledWith("1", 2012, "regular");
      expect(getPlayersFromDb).toHaveBeenCalledWith("1", 2013, "regular");
      expect(getPlayersFromDb).toHaveBeenCalledWith("1", 2014, "regular");
    });

    test("returns empty array when no seasons are available", async () => {
      (availableSeasons as jest.Mock).mockReturnValue([]);
      (mapCombinedPlayerDataFromPlayersWithSeason as jest.Mock).mockReturnValue([]);
      (applyPlayerScores as jest.Mock).mockImplementation((data) => data);
      (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);

      const result = await getPlayersStatsCombined("regular");

      expect(result).toEqual([]);
      expect(getPlayersFromDb).not.toHaveBeenCalled();
    });

    test("filters seasons when startFrom is provided", async () => {
      (availableSeasons as jest.Mock).mockReturnValue([2012, 2013, 2014, 2020]);

      const result = await getPlayersStatsCombined("regular", "1", 2020);

      expect(availableSeasons).toHaveBeenCalledWith("1", "regular");
      expect(getPlayersFromDb).toHaveBeenCalledTimes(1);
      expect(getPlayersFromDb).toHaveBeenCalledWith("1", 2020, "regular");
      expect(result).toEqual([mockPlayer]);
    });

    test("returns all seasons when startFrom is undefined", async () => {
      const result = await getPlayersStatsCombined("regular", "1", undefined);

      expect(availableSeasons).toHaveBeenCalledWith("1", "regular");
      expect(getPlayersFromDb).toHaveBeenCalledTimes(3);
      expect(result).toEqual([mockPlayer]);
    });

    test("returns empty array when startFrom is after all available seasons", async () => {
      (mapCombinedPlayerDataFromPlayersWithSeason as jest.Mock).mockReturnValue([]);

      const result = await getPlayersStatsCombined("regular", "1", 2025);

      expect(availableSeasons).toHaveBeenCalledWith("1", "regular");
      expect(result).toEqual([]);
    });

    test("when reportType is both, queries regular+playoffs and merges before combining", async () => {
      (availableSeasons as jest.Mock).mockReturnValue([2024]);

      const regular = { ...mockPlayerWithSeason, games: 12, points: 6 };
      const playoffs = { ...mockPlayerWithSeason, games: 4, points: 3 };

      (getPlayersFromDb as jest.Mock)
        .mockResolvedValueOnce([regular]) // regular
        .mockResolvedValueOnce([playoffs]); // playoffs
      (mapCombinedPlayerDataFromPlayersWithSeason as jest.Mock).mockReturnValue([mockPlayer]);

      const result = await getPlayersStatsCombined("both", "1", 2020);

      expect(availableSeasons).toHaveBeenCalledWith("1", "both");
      expect(getPlayersFromDb).toHaveBeenCalledWith("1", 2024, "regular");
      expect(getPlayersFromDb).toHaveBeenCalledWith("1", 2024, "playoffs");

      expect(mapCombinedPlayerDataFromPlayersWithSeason).toHaveBeenCalledWith([
        expect.objectContaining({ name: "Test Player", season: 2024, games: 16, points: 9 }),
      ]);
      expect(result).toEqual([mockPlayer]);
    });
  });

  describe("getGoaliesStatsCombined", () => {
    beforeEach(() => {
      (availableSeasons as jest.Mock).mockReturnValue([2012, 2013, 2014]);
      (getGoaliesFromDb as jest.Mock).mockResolvedValue([mockGoalieWithSeason]);
      (mapCombinedGoalieDataFromGoaliesWithSeason as jest.Mock).mockReturnValue([mockGoalie]);
      (applyGoalieScores as jest.Mock).mockImplementation((data) => data);
      (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);
    });

    test("fetches goalie stats for all available seasons", async () => {
      const result = await getGoaliesStatsCombined("regular");

      expect(availableSeasons).toHaveBeenCalledWith("1", "regular");
      expect(getGoaliesFromDb).toHaveBeenCalledTimes(3);
      expect(mapCombinedGoalieDataFromGoaliesWithSeason).toHaveBeenCalled();
      expect(sortItemsByStatField).toHaveBeenCalledWith([mockGoalie], "goalies");
      expect(result).toEqual([mockGoalie]);
    });

    test("queries DB for each season", async () => {
      await getGoaliesStatsCombined("regular");

      expect(getGoaliesFromDb).toHaveBeenCalledWith("1", 2012, "regular");
      expect(getGoaliesFromDb).toHaveBeenCalledWith("1", 2013, "regular");
      expect(getGoaliesFromDb).toHaveBeenCalledWith("1", 2014, "regular");
    });

    test("filters seasons when startFrom is provided", async () => {
      (availableSeasons as jest.Mock).mockReturnValue([2012, 2013, 2014, 2020]);

      const result = await getGoaliesStatsCombined("regular", "1", 2020);

      expect(availableSeasons).toHaveBeenCalledWith("1", "regular");
      expect(getGoaliesFromDb).toHaveBeenCalledTimes(1);
      expect(getGoaliesFromDb).toHaveBeenCalledWith("1", 2020, "regular");
      expect(result).toEqual([mockGoalie]);
    });

    test("returns all seasons when startFrom is undefined", async () => {
      const result = await getGoaliesStatsCombined("regular", "1", undefined);

      expect(availableSeasons).toHaveBeenCalledWith("1", "regular");
      expect(getGoaliesFromDb).toHaveBeenCalledTimes(3);
      expect(result).toEqual([mockGoalie]);
    });

    test("returns empty array when startFrom is after all available seasons", async () => {
      (mapCombinedGoalieDataFromGoaliesWithSeason as jest.Mock).mockReturnValue([]);

      const result = await getGoaliesStatsCombined("regular", "1", 2025);

      expect(availableSeasons).toHaveBeenCalledWith("1", "regular");
      expect(result).toEqual([]);
    });

    test("when reportType is both, queries regular+playoffs and strips gaa/savePercent", async () => {
      (availableSeasons as jest.Mock).mockReturnValue([2024]);

      const regular = { ...mockGoalieWithSeason, games: 10, wins: 6, gaa: "2.30", savePercent: "0.920" };
      const playoffs = { ...mockGoalieWithSeason, games: 2, wins: 1, gaa: "1.00", savePercent: "0.950" };

      (getGoaliesFromDb as jest.Mock)
        .mockResolvedValueOnce([regular]) // regular
        .mockResolvedValueOnce([playoffs]); // playoffs
      (mapCombinedGoalieDataFromGoaliesWithSeason as jest.Mock).mockReturnValue([mockGoalie]);

      const result = await getGoaliesStatsCombined("both", "1", 2020);

      expect(availableSeasons).toHaveBeenCalledWith("1", "both");
      expect(getGoaliesFromDb).toHaveBeenCalledWith("1", 2024, "regular");
      expect(getGoaliesFromDb).toHaveBeenCalledWith("1", 2024, "playoffs");

      expect(mapCombinedGoalieDataFromGoaliesWithSeason).toHaveBeenCalledWith([
        expect.objectContaining({
          name: "Test Goalie",
          season: 2024,
          games: 12,
          wins: 7,
          gaa: undefined,
          savePercent: undefined,
        }),
      ]);
      expect(result).toEqual([mockGoalie]);
    });
  });
});
