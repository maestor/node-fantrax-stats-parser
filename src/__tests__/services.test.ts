import csv from "csvtojson";
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
  applyGoalieScores,
} from "../helpers";
import {
  mapAvailableSeasons,
  mapPlayerData,
  mapGoalieData,
  mapCombinedPlayerData,
  mapCombinedGoalieData,
} from "../mappings";
import { mockRawDataPlayer, mockRawDataGoalie2014, mockPlayer, mockGoalie } from "./fixtures";

jest.mock("csvtojson");
jest.mock("../helpers");
jest.mock("../mappings");

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
      (mapAvailableSeasons as jest.Mock).mockReturnValue(mockSeasons);

      const result = await getAvailableSeasons();

      expect(mapAvailableSeasons).toHaveBeenCalled();
      expect(result).toEqual(mockSeasons);
    });
  });

  describe("getPlayersStatsSeason", () => {
    beforeEach(() => {
      const mockCsv = jest.fn().mockReturnValue({
        fromFile: jest.fn().mockResolvedValue([mockRawDataPlayer]),
      });
      (csv as unknown as jest.Mock).mockImplementation(mockCsv);
      (availableSeasons as jest.Mock).mockReturnValue([2012, 2013, 2024]);
      (mapPlayerData as jest.Mock).mockReturnValue([mockPlayer]);
      (applyPlayerScores as jest.Mock).mockImplementation((data) => data);
      (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);
    });

    test("fetches player stats and sorts by specified field", async () => {
      const result = await getPlayersStatsSeason("regular", 2024, "goals");

      expect(mapPlayerData).toHaveBeenCalled();
      expect(sortItemsByStatField).toHaveBeenCalledWith([mockPlayer], "players", "goals");
      expect(result).toEqual([mockPlayer]);
    });

    test("uses max season when season is undefined", async () => {
      await getPlayersStatsSeason("regular", undefined, "goals");

      const csvMock = (csv as unknown as jest.Mock).mock.results[0].value;
      expect(csvMock.fromFile).toHaveBeenCalledWith(
        expect.stringContaining("regular-2024-2025.csv")
      );
    });

    test("works without sortBy parameter", async () => {
      const result = await getPlayersStatsSeason("regular", 2024);

      expect(sortItemsByStatField).toHaveBeenCalledWith([mockPlayer], "players", undefined);
      expect(result).toEqual([mockPlayer]);
    });

    test("constructs correct CSV file path", async () => {
      await getPlayersStatsSeason("playoffs", 2023, "points");

      const csvMock = (csv as unknown as jest.Mock).mock.results[0].value;
      expect(csvMock.fromFile).toHaveBeenCalledWith(
        expect.stringContaining("playoffs-2023-2024.csv")
      );
    });
  });

  describe("getGoaliesStatsSeason", () => {
    beforeEach(() => {
      const mockCsv = jest.fn().mockReturnValue({
        fromFile: jest.fn().mockResolvedValue([mockRawDataGoalie2014]),
      });
      (csv as unknown as jest.Mock).mockImplementation(mockCsv);
      (availableSeasons as jest.Mock).mockReturnValue([2012, 2013, 2024]);
      (mapGoalieData as jest.Mock).mockReturnValue([mockGoalie]);
      (applyGoalieScores as jest.Mock).mockImplementation((data) => data);
      (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);
    });

    test("fetches goalie stats and sorts by specified field", async () => {
      const result = await getGoaliesStatsSeason("regular", 2024, "wins");

      expect(mapGoalieData).toHaveBeenCalled();
      expect(sortItemsByStatField).toHaveBeenCalledWith([mockGoalie], "goalies", "wins");
      expect(result).toEqual([mockGoalie]);
    });

    test("uses max season when season is undefined", async () => {
      await getGoaliesStatsSeason("regular", undefined, "wins");

      const csvMock = (csv as unknown as jest.Mock).mock.results[0].value;
      expect(csvMock.fromFile).toHaveBeenCalledWith(
        expect.stringContaining("regular-2024-2025.csv")
      );
    });

    test("works without sortBy parameter", async () => {
      const result = await getGoaliesStatsSeason("regular", 2024);

      expect(sortItemsByStatField).toHaveBeenCalledWith([mockGoalie], "goalies", undefined);
      expect(result).toEqual([mockGoalie]);
    });
  });

  describe("getPlayersStatsCombined", () => {
    beforeEach(() => {
      const mockCsv = jest.fn().mockReturnValue({
        fromFile: jest.fn().mockResolvedValue([mockRawDataPlayer]),
      });
      (csv as unknown as jest.Mock).mockImplementation(mockCsv);
      (availableSeasons as jest.Mock).mockReturnValue([2012, 2013, 2014]);
      (mapCombinedPlayerData as jest.Mock).mockReturnValue([mockPlayer]);
      (applyPlayerScores as jest.Mock).mockImplementation((data) => data);
      (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);
    });

    test("fetches player stats for all available seasons", async () => {
      const result = await getPlayersStatsCombined("regular", "points");

      expect(availableSeasons).toHaveBeenCalled();
      expect(mapCombinedPlayerData).toHaveBeenCalled();
      expect(sortItemsByStatField).toHaveBeenCalledWith([mockPlayer], "players", "points");
      expect(result).toEqual([mockPlayer]);
    });

    test("reads CSV files for all seasons", async () => {
      await getPlayersStatsCombined("regular", "points");

      const csvMock = (csv as unknown as jest.Mock).mock.results[0].value;
      expect(csvMock.fromFile).toHaveBeenCalledTimes(3);
    });

    test("works without sortBy parameter", async () => {
      const result = await getPlayersStatsCombined("regular");

      expect(sortItemsByStatField).toHaveBeenCalledWith([mockPlayer], "players", undefined);
      expect(result).toEqual([mockPlayer]);
    });
  });

  describe("getGoaliesStatsCombined", () => {
    beforeEach(() => {
      const mockCsv = jest.fn().mockReturnValue({
        fromFile: jest.fn().mockResolvedValue([mockRawDataGoalie2014]),
      });
      (csv as unknown as jest.Mock).mockImplementation(mockCsv);
      (availableSeasons as jest.Mock).mockReturnValue([2012, 2013, 2014]);
      (mapCombinedGoalieData as jest.Mock).mockReturnValue([mockGoalie]);
      (applyGoalieScores as jest.Mock).mockImplementation((data) => data);
      (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);
    });

    test("fetches goalie stats for all available seasons", async () => {
      const result = await getGoaliesStatsCombined("regular", "wins");

      expect(availableSeasons).toHaveBeenCalled();
      expect(mapCombinedGoalieData).toHaveBeenCalled();
      expect(sortItemsByStatField).toHaveBeenCalledWith([mockGoalie], "goalies", "wins");
      expect(result).toEqual([mockGoalie]);
    });

    test("reads CSV files for all seasons", async () => {
      await getGoaliesStatsCombined("regular", "wins");

      const csvMock = (csv as unknown as jest.Mock).mock.results[0].value;
      expect(csvMock.fromFile).toHaveBeenCalledTimes(3);
    });

    test("works without sortBy parameter", async () => {
      const result = await getGoaliesStatsCombined("regular");

      expect(sortItemsByStatField).toHaveBeenCalledWith([mockGoalie], "goalies", undefined);
      expect(result).toEqual([mockGoalie]);
    });
  });

  describe("CSV error handling", () => {
    test("returns empty array for missing file in single season", async () => {
      const mockCsv = jest.fn().mockReturnValue({
        fromFile: jest.fn().mockRejectedValue(new Error("File not found")),
      });
      (csv as unknown as jest.Mock).mockImplementation(mockCsv);
      (availableSeasons as jest.Mock).mockReturnValue([2024]);
      (mapPlayerData as jest.Mock).mockReturnValue([]);
      (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);

      const result = await getPlayersStatsSeason("regular", 2024);

      expect(result).toEqual([]);
    });

    test("handles partial file read errors in combined data", async () => {
      const mockCsv = jest.fn().mockReturnValue({
        fromFile: jest
          .fn()
          .mockResolvedValueOnce([mockRawDataPlayer])
          .mockRejectedValueOnce(new Error("File not found"))
          .mockResolvedValueOnce([mockRawDataPlayer]),
      });
      (csv as unknown as jest.Mock).mockImplementation(mockCsv);
      (availableSeasons as jest.Mock).mockReturnValue([2012, 2013, 2014]);
      (mapCombinedPlayerData as jest.Mock).mockImplementation((data) => {
        expect(data.length).toBeGreaterThan(0);
        return [mockPlayer];
      });
      (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);

      const result = await getPlayersStatsCombined("regular");

      expect(result).toEqual([mockPlayer]);
    });

    test("returns data even if some CSV files are missing", async () => {
      const mockCsv = jest.fn().mockReturnValue({
        fromFile: jest
          .fn()
          .mockRejectedValueOnce(new Error("Not found"))
          .mockRejectedValueOnce(new Error("Not found"))
          .mockResolvedValueOnce([mockRawDataGoalie2014]),
      });
      (csv as unknown as jest.Mock).mockImplementation(mockCsv);
      (availableSeasons as jest.Mock).mockReturnValue([2012, 2013, 2014]);
      (mapCombinedGoalieData as jest.Mock).mockReturnValue([mockGoalie]);
      (sortItemsByStatField as jest.Mock).mockImplementation((data) => data);

      const result = await getGoaliesStatsCombined("regular");

      expect(result).toEqual([mockGoalie]);
    });
  });
});
