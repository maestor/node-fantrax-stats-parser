import path from "path";

import {
  DEFAULT_TRANSACTIONS_OUT_DIR,
  TRANSACTION_TYPES,
  buildTransactionCsvPath,
  buildTransactionHistoryUrl,
  formatSeasonSpan,
  parseTransactionCsvFileName,
  resolveTransactionImportYears,
} from "../features/transactions/files";

describe("transaction helpers", () => {
  describe("transaction types", () => {
    test("exposes the supported transaction types", () => {
      expect(TRANSACTION_TYPES).toEqual(["claims", "trades"]);
    });
  });

  describe("season formatting", () => {
    test("formats season spans and default output path", () => {
      expect(formatSeasonSpan(2012)).toBe("2012-2013");
      expect(DEFAULT_TRANSACTIONS_OUT_DIR).toBe(
        path.resolve("csv", "transactions"),
      );
    });
  });

  describe("CSV naming", () => {
    test("builds claims and trades file paths with the expected names", () => {
      expect(
        buildTransactionCsvPath({
          outDir: "csv/transactions",
          type: "claims",
          seasonStartYear: 2025,
        }),
      ).toBe(path.resolve("csv/transactions", "claims-2025-2026.csv"));
      expect(
        buildTransactionCsvPath({
          outDir: "csv/transactions",
          type: "trades",
          seasonStartYear: 2024,
        }),
      ).toBe(path.resolve("csv/transactions", "trades-2024-2025.csv"));
    });

    test("parses valid transaction CSV names", () => {
      expect(parseTransactionCsvFileName("claims-2012-2013.csv")).toEqual({
        type: "claims",
        seasonStartYear: 2012,
      });
      expect(parseTransactionCsvFileName("trades-2025-2026.csv")).toEqual({
        type: "trades",
        seasonStartYear: 2025,
      });
    });

    test("rejects invalid transaction CSV names", () => {
      expect(parseTransactionCsvFileName("claims-2012-2014.csv")).toBeNull();
      expect(parseTransactionCsvFileName("trade-2025-2026.csv")).toBeNull();
      expect(parseTransactionCsvFileName("claims-2025-2026.txt")).toBeNull();
    });
  });

  describe("history URLs", () => {
    test("builds Fantrax transaction history URLs", () => {
      expect(
        buildTransactionHistoryUrl({
          leagueId: "league 1",
          type: "claims",
        }),
      ).toBe(
        "https://www.fantrax.com/fantasy/league/league%201/transactions/history;view=CLAIM_DROP",
      );

      expect(
        buildTransactionHistoryUrl({
          leagueId: "league/2",
          type: "trades",
        }),
      ).toBe(
        "https://www.fantrax.com/fantasy/league/league%2F2/transactions/history;view=TRADE",
      );
    });
  });

  describe("resolveTransactionImportYears", () => {
    test("defaults to the latest available season", () => {
      expect(
        resolveTransactionImportYears({
          availableYears: [2024, 2025, 2023, 2025],
          importAll: false,
        }),
      ).toEqual([2025]);
    });

    test("returns all available seasons in ascending order when requested", () => {
      expect(
        resolveTransactionImportYears({
          availableYears: [2025, 2023, 2024, 2025],
          importAll: true,
        }),
      ).toEqual([2023, 2024, 2025]);
    });

    test("returns a requested available season", () => {
      expect(
        resolveTransactionImportYears({
          availableYears: [2024, 2025, 2023],
          importAll: false,
          requestedYear: "2024",
        }),
      ).toEqual([2024]);
    });

    test("treats empty requested years as omitted", () => {
      expect(
        resolveTransactionImportYears({
          availableYears: [2024, 2025],
          importAll: false,
          requestedYear: "   ",
        }),
      ).toEqual([2025]);
    });

    test("treats null requested years as omitted", () => {
      expect(
        resolveTransactionImportYears({
          availableYears: [2024, 2025],
          importAll: false,
          requestedYear: null,
        }),
      ).toEqual([2025]);
    });

    test("rejects conflicting year selectors", () => {
      expect(() =>
        resolveTransactionImportYears({
          availableYears: [2024, 2025],
          importAll: true,
          requestedYear: 2025,
        }),
      ).toThrow("Use either --all or --year, not both.");
    });

    test("rejects invalid or unavailable years", () => {
      expect(() =>
        resolveTransactionImportYears({
          availableYears: [2024, 2025],
          importAll: false,
          requestedYear: "abcd",
        }),
      ).toThrow("Invalid year: abcd");

      expect(() =>
        resolveTransactionImportYears({
          availableYears: [2024, 2025],
          importAll: false,
          requestedYear: 2023,
        }),
      ).toThrow("Year 2023 is not available. Valid years: 2024, 2025.");
    });

    test("rejects missing mapped seasons", () => {
      expect(() =>
        resolveTransactionImportYears({
          availableYears: [],
          importAll: false,
        }),
      ).toThrow("No mapped Fantrax seasons available.");
    });
  });
});
