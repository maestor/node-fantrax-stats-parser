// Set up mocks before imports
const mockStorage = {
  readFile: jest.fn(),
  fileExists: jest.fn(),
  getLastModified: jest.fn(),
};

const mockFromFile = jest.fn();
const mockCsvInstance = { fromFile: mockFromFile };

jest.mock("../storage", () => ({
  isR2Enabled: jest.fn(() => true),
  getStorage: jest.fn(() => mockStorage),
}));

jest.mock("csvtojson", () => {
  return jest.fn(() => mockCsvInstance);
});

jest.mock("../helpers", () => {
  class MockApiError extends Error {
    statusCode: number;
    constructor(statusCode: number, message: string) {
      super(message);
      this.statusCode = statusCode;
      this.name = "ApiError";
    }
  }

  return {
    ApiError: MockApiError,
    availableSeasons: jest.fn(),
    sortItemsByStatField: jest.fn((data) => data),
    applyPlayerScores: jest.fn((data) => data),
    applyPlayerScoresByPosition: jest.fn((data) => data),
  };
});

jest.mock("../mappings", () => ({
  mapPlayerData: jest.fn(),
}));

jest.mock("../csvIntegrity", () => ({
  validateCsvFileOnceOrThrow: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("fs", () => ({
  promises: {
    writeFile: jest.fn().mockResolvedValue(undefined),
    unlink: jest.fn().mockResolvedValue(undefined),
  },
}));

// Now import the modules
import fs from "fs";
import { getPlayersStatsSeason } from "../services";
import { availableSeasons, applyPlayerScores, applyPlayerScoresByPosition } from "../helpers";
import { mapPlayerData } from "../mappings";

describe("services - R2 mode", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("R2 mode: fetches CSV from storage, writes temp file, parses, and cleans up", async () => {
    const csvContent = "Player,Team\nPlayer 1,COL";
    const mockParsedData = [{ player: "Player 1", team: "COL", season: 2024 }];
    const mockMappedData = [{ name: "Player 1", games: 10 }];

    mockStorage.readFile.mockResolvedValue(csvContent);
    mockFromFile.mockResolvedValue(mockParsedData);
    (availableSeasons as jest.Mock).mockReturnValue([2024]);
    (mapPlayerData as jest.Mock).mockReturnValue(mockMappedData);
    (applyPlayerScores as jest.Mock).mockImplementation((data) => data);
    (applyPlayerScoresByPosition as jest.Mock).mockImplementation((data) => data);

    await getPlayersStatsSeason("regular", 2024);

    // Verify storage.readFile was called
    expect(mockStorage.readFile).toHaveBeenCalledWith(
      expect.stringContaining("csv/1/regular-2024-2025.csv")
    );

    // Verify temp file was created
    expect(fs.promises.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("csv-"),
      csvContent
    );

    // Verify CSV was parsed from temp file
    expect(mockFromFile).toHaveBeenCalledWith(expect.stringContaining("csv-"));

    // Verify temp file was cleaned up
    expect(fs.promises.unlink).toHaveBeenCalledWith(expect.stringContaining("csv-"));
  });

  test("R2 mode: cleans up temp file even when parsing fails", async () => {
    const csvContent = "Invalid CSV content";
    mockStorage.readFile.mockResolvedValue(csvContent);
    mockFromFile.mockRejectedValue(new Error("Parse error"));
    (availableSeasons as jest.Mock).mockReturnValue([2024]);
    (mapPlayerData as jest.Mock).mockReturnValue([]);
    (applyPlayerScores as jest.Mock).mockImplementation((data) => data);
    (applyPlayerScoresByPosition as jest.Mock).mockImplementation((data) => data);

    // Service catches errors and returns empty array, doesn't throw
    const result = await getPlayersStatsSeason("regular", 2024);
    expect(result).toEqual([]);

    // Verify temp file was created
    expect(fs.promises.writeFile).toHaveBeenCalled();

    // Verify temp file cleanup was attempted
    expect(fs.promises.unlink).toHaveBeenCalled();
  });

  test("R2 mode: handles temp file cleanup failure silently", async () => {
    const csvContent = "Player,Team\nPlayer 1,COL";
    const mockParsedData = [{ player: "Player 1", team: "COL", season: 2024 }];
    const mockMappedData = [{ name: "Player 1", games: 10 }];

    mockStorage.readFile.mockResolvedValue(csvContent);
    mockFromFile.mockResolvedValue(mockParsedData);
    (fs.promises.unlink as jest.Mock).mockRejectedValue(new Error("ENOENT: file not found"));
    (availableSeasons as jest.Mock).mockReturnValue([2024]);
    (mapPlayerData as jest.Mock).mockReturnValue(mockMappedData);
    (applyPlayerScores as jest.Mock).mockImplementation((data) => data);
    (applyPlayerScoresByPosition as jest.Mock).mockImplementation((data) => data);

    // Should not throw even though cleanup fails
    const result = await getPlayersStatsSeason("regular", 2024);

    expect(result).toEqual(mockMappedData);
    expect(fs.promises.unlink).toHaveBeenCalled();
  });
});
