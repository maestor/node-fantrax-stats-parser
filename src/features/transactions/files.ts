import path from "path";

import { FANTRAX_URLS } from "../../constants";

export const DEFAULT_TRANSACTIONS_OUT_DIR = path.resolve(
  "csv",
  "transactions",
);

export const TRANSACTION_TYPES = ["claims", "trades"] as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number];

const TRANSACTION_VIEW_BY_TYPE = {
  claims: "CLAIM_DROP",
  trades: "TRADE",
} as const satisfies Record<TransactionType, string>;

export const formatSeasonSpan = (seasonStartYear: number): string =>
  `${seasonStartYear}-${seasonStartYear + 1}`;

const buildTransactionCsvFileName = (args: {
  type: TransactionType;
  seasonStartYear: number;
}): string => `${args.type}-${formatSeasonSpan(args.seasonStartYear)}.csv`;

export const buildTransactionCsvPath = (args: {
  outDir: string;
  type: TransactionType;
  seasonStartYear: number;
}): string => path.resolve(args.outDir, buildTransactionCsvFileName(args));

export const parseTransactionCsvFileName = (
  fileName: string,
): { type: TransactionType; seasonStartYear: number } | null => {
  const match = /^(claims|trades)-(\d{4})-(\d{4})\.csv$/.exec(fileName);
  if (!match) {
    return null;
  }

  const seasonStartYear = Number(match[2]);
  const seasonEndYear = Number(match[3]);
  if (seasonEndYear !== seasonStartYear + 1) {
    return null;
  }

  return { type: match[1] as TransactionType, seasonStartYear };
};

export const buildTransactionHistoryUrl = (args: {
  leagueId: string;
  type: TransactionType;
}): string =>
  `${FANTRAX_URLS.league}/${encodeURIComponent(args.leagueId)}/transactions/history;view=${
    TRANSACTION_VIEW_BY_TYPE[args.type]
  }`;

export const resolveTransactionImportYears = (args: {
  availableYears: number[];
  importAll: boolean;
  requestedYear?: number | string | null;
}): number[] => {
  const availableYears = [...new Set(args.availableYears.filter(Number.isFinite))]
    .sort((a, b) => b - a);

  if (!availableYears.length) {
    throw new Error("No mapped Fantrax seasons available.");
  }

  const requestedYear =
    args.requestedYear == null ? undefined : String(args.requestedYear).trim();

  if (args.importAll && requestedYear) {
    throw new Error("Use either --all or --year, not both.");
  }

  if (args.importAll) {
    return availableYears.slice().sort((a, b) => a - b);
  }

  if (!requestedYear) {
    return [availableYears[0]];
  }

  const year = Number(requestedYear);
  if (!Number.isFinite(year)) {
    throw new Error(`Invalid year: ${requestedYear}`);
  }

  if (!availableYears.includes(year)) {
    const validYears = availableYears.slice().sort((a, b) => a - b).join(", ");
    throw new Error(
      `Year ${year} is not available. Valid years: ${validYears}.`,
    );
  }

  return [year];
};
