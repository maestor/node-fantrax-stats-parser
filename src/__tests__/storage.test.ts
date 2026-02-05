import fs from "fs";
import { getStorage, resetStorageForTests, isR2Enabled } from "../storage/index";
import { getR2Client } from "../storage/r2-client";
import { getSeasonManifest, resetManifestCache } from "../storage/manifest";

// Mock fs module
jest.mock("fs", () => ({
  promises: {
    readFile: jest.fn(),
    access: jest.fn(),
    stat: jest.fn(),
  },
}));

// Mock R2 client
jest.mock("../storage/r2-client", () => {
  const mockR2Client = {
    getObject: jest.fn(),
    putObject: jest.fn(),
    objectExists: jest.fn(),
    getLastModified: jest.fn(),
  };

  return {
    getR2Client: jest.fn(() => mockR2Client),
    isR2Enabled: jest.fn(() => process.env.USE_R2_STORAGE === "true"),
    resetR2ClientForTests: jest.fn(),
    R2Client: jest.fn(),
  };
});

describe("storage", () => {
  const originalEnv = process.env.USE_R2_STORAGE;

  beforeEach(() => {
    resetStorageForTests();
    resetManifestCache();
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env.USE_R2_STORAGE = originalEnv;
  });

  describe("FileSystemStorage", () => {
    beforeEach(() => {
      process.env.USE_R2_STORAGE = "false";
      resetStorageForTests();
    });

    test("readFile reads from filesystem", async () => {
      const mockReadFile = fs.promises.readFile as jest.Mock;
      mockReadFile.mockResolvedValue("test content");

      const storage = getStorage();
      const result = await storage.readFile("/path/to/file.csv");

      expect(result).toBe("test content");
      expect(mockReadFile).toHaveBeenCalledWith("/path/to/file.csv", "utf-8");
    });

    test("fileExists returns true when file exists", async () => {
      const mockAccess = fs.promises.access as jest.Mock;
      mockAccess.mockResolvedValue(undefined);

      const storage = getStorage();
      const result = await storage.fileExists("/path/to/file.csv");

      expect(result).toBe(true);
      expect(mockAccess).toHaveBeenCalledWith("/path/to/file.csv");
    });

    test("fileExists returns false when file does not exist", async () => {
      const mockAccess = fs.promises.access as jest.Mock;
      mockAccess.mockRejectedValue(new Error("ENOENT"));

      const storage = getStorage();
      const result = await storage.fileExists("/path/to/file.csv");

      expect(result).toBe(false);
    });

    test("getLastModified returns mtime when file exists", async () => {
      const mockStat = fs.promises.stat as jest.Mock;
      const mockDate = new Date("2025-01-01");
      mockStat.mockResolvedValue({ mtime: mockDate });

      const storage = getStorage();
      const result = await storage.getLastModified("/path/to/file.csv");

      expect(result).toBe(mockDate);
      expect(mockStat).toHaveBeenCalledWith("/path/to/file.csv");
    });

    test("getLastModified returns null when file does not exist", async () => {
      const mockStat = fs.promises.stat as jest.Mock;
      mockStat.mockRejectedValue(new Error("ENOENT"));

      const storage = getStorage();
      const result = await storage.getLastModified("/path/to/file.csv");

      expect(result).toBeNull();
    });
  });

  describe("R2Storage", () => {
    beforeEach(() => {
      process.env.USE_R2_STORAGE = "true";
      resetStorageForTests();
    });

    test("readFile reads from R2", async () => {
      const mockR2 = getR2Client();
      (mockR2.getObject as jest.Mock).mockResolvedValue("r2 content");

      const storage = getStorage();
      const result = await storage.readFile("/path/to/csv/1/regular-2024-2025.csv");

      expect(result).toBe("r2 content");
      expect(mockR2.getObject).toHaveBeenCalledWith("1/regular-2024-2025.csv");
    });

    test("readFile converts path to R2 key correctly", async () => {
      const mockR2 = getR2Client();
      (mockR2.getObject as jest.Mock).mockResolvedValue("content");

      const storage = getStorage();
      await storage.readFile("/some/path/csv/2/playoffs-2023-2024.csv");

      expect(mockR2.getObject).toHaveBeenCalledWith("2/playoffs-2023-2024.csv");
    });

    test("readFile throws error for invalid path", async () => {
      const storage = getStorage();

      await expect(storage.readFile("/invalid/path/without/csv")).rejects.toThrow(
        "Invalid CSV path"
      );
    });

    test("fileExists checks R2 object existence", async () => {
      const mockR2 = getR2Client();
      (mockR2.objectExists as jest.Mock).mockResolvedValue(true);

      const storage = getStorage();
      const result = await storage.fileExists("/path/to/csv/1/regular-2024-2025.csv");

      expect(result).toBe(true);
      expect(mockR2.objectExists).toHaveBeenCalledWith("1/regular-2024-2025.csv");
    });

    test("getLastModified returns R2 object last modified date", async () => {
      const mockR2 = getR2Client();
      const mockDate = new Date("2025-01-01");
      (mockR2.getLastModified as jest.Mock).mockResolvedValue(mockDate);

      const storage = getStorage();
      const result = await storage.getLastModified("/path/to/csv/1/regular-2024-2025.csv");

      expect(result).toBe(mockDate);
      expect(mockR2.getLastModified).toHaveBeenCalledWith("1/regular-2024-2025.csv");
    });
  });

  describe("isR2Enabled", () => {
    test("returns true when USE_R2_STORAGE is true", () => {
      process.env.USE_R2_STORAGE = "true";
      expect(isR2Enabled()).toBe(true);
    });

    test("returns false when USE_R2_STORAGE is false", () => {
      process.env.USE_R2_STORAGE = "false";
      expect(isR2Enabled()).toBe(false);
    });

    test("returns false when USE_R2_STORAGE is not set", () => {
      delete process.env.USE_R2_STORAGE;
      expect(isR2Enabled()).toBe(false);
    });
  });

  describe("manifest", () => {
    beforeEach(() => {
      process.env.USE_R2_STORAGE = "true";
      resetManifestCache();
    });

    test("getSeasonManifest fetches and caches manifest from R2", async () => {
      const mockR2 = getR2Client();
      const mockManifest = {
        "1": { regular: [2023, 2024], playoffs: [2023] },
        "2": { regular: [2023, 2024], playoffs: [2023, 2024] },
      };
      (mockR2.getObject as jest.Mock).mockResolvedValue(JSON.stringify(mockManifest));

      const result = await getSeasonManifest();

      expect(result).toEqual(mockManifest);
      expect(mockR2.getObject).toHaveBeenCalledWith("manifest.json");
    });

    test("getSeasonManifest returns cached manifest on second call", async () => {
      const mockR2 = getR2Client();
      const mockManifest = { "1": { regular: [2023], playoffs: [] } };
      (mockR2.getObject as jest.Mock).mockResolvedValue(JSON.stringify(mockManifest));

      await getSeasonManifest();
      const result = await getSeasonManifest();

      expect(result).toEqual(mockManifest);
      expect(mockR2.getObject).toHaveBeenCalledTimes(1);
    });

    test("getSeasonManifest returns empty object when fetch fails", async () => {
      const mockR2 = getR2Client();
      (mockR2.getObject as jest.Mock).mockRejectedValue(new Error("Not found"));

      const result = await getSeasonManifest();

      expect(result).toEqual({});
    });

    test("resetManifestCache clears the cache", async () => {
      const mockR2 = getR2Client();
      const mockManifest = { "1": { regular: [2023], playoffs: [] } };
      (mockR2.getObject as jest.Mock).mockResolvedValue(JSON.stringify(mockManifest));

      await getSeasonManifest();
      resetManifestCache();
      await getSeasonManifest();

      expect(mockR2.getObject).toHaveBeenCalledTimes(2);
    });
  });
});
