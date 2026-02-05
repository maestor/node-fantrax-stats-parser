import { ApiError, HTTP_STATUS } from "./helpers";
import { getStorage } from "./storage";

export type CsvIntegrityIssueCode =
  | "missing_skaters_marker"
  | "missing_goalies_marker"
  | "missing_skaters_header"
  | "missing_goalies_header"
  | "unexpected_skaters_header"
  | "unexpected_goalies_header";

export type CsvIntegrityIssue = {
  code: CsvIntegrityIssueCode;
  message: string;
};

export const EXPECTED_SKATERS_MARKER = '"Skaters"';
export const EXPECTED_GOALIES_MARKER = '"Goalies"';

export const EXPECTED_SKATERS_HEADER =
  '"Pos","Player","Team","Eligible","Status","Opponent","GP","G","A","Pt","+/-","PIM","SOG","PPP","SHP","Hit","Blk"';

// Fantrax has exported two goalie header variants over time:
// - older: GP, W
// - newer: GP, W-G
export const EXPECTED_GOALIES_HEADER =
  '"Pos","Player","Team","Eligible","Status","Opponent","GP","W","GAA","SV","SV%","SHO","PIM","G","A","Pt","PPP","SHP"';

export const EXPECTED_GOALIES_HEADER_WG =
  '"Pos","Player","Team","Eligible","Status","Opponent","GP","W-G","GAA","SV","SV%","SHO","PIM","G","A","Pt","PPP","SHP"';

const normalizeLine = (line: string): string => line.trim();

export const validateNormalizedCsvLines = (lines: string[]): CsvIntegrityIssue[] => {
  const issues: CsvIntegrityIssue[] = [];
  const nonEmpty = lines.map(normalizeLine).filter(Boolean);

  const skatersMarkerIndex = nonEmpty.findIndex((l) => l === EXPECTED_SKATERS_MARKER);
  if (skatersMarkerIndex === -1) {
    issues.push({
      code: "missing_skaters_marker",
      message: `Missing skaters marker line (${EXPECTED_SKATERS_MARKER}).`,
    });
  } else {
    const header = nonEmpty[skatersMarkerIndex + 1];
    if (!header) {
      issues.push({
        code: "missing_skaters_header",
        message: "Missing skaters header line after skaters marker.",
      });
    } else if (header !== EXPECTED_SKATERS_HEADER) {
      issues.push({
        code: "unexpected_skaters_header",
        message: "Skaters header line did not match expected normalized format.",
      });
    }
  }

  const goaliesMarkerIndex = nonEmpty.findIndex((l) => l === EXPECTED_GOALIES_MARKER);
  if (goaliesMarkerIndex === -1) {
    issues.push({
      code: "missing_goalies_marker",
      message: `Missing goalies marker line (${EXPECTED_GOALIES_MARKER}).`,
    });
  } else {
    const header = nonEmpty[goaliesMarkerIndex + 1];
    if (!header) {
      issues.push({
        code: "missing_goalies_header",
        message: "Missing goalies header line after goalies marker.",
      });
    } else if (header !== EXPECTED_GOALIES_HEADER && header !== EXPECTED_GOALIES_HEADER_WG) {
      issues.push({
        code: "unexpected_goalies_header",
        message: "Goalies header line did not match expected normalized format.",
      });
    }
  }

  return issues;
};

const formatIssues = (issues: CsvIntegrityIssue[]): string => {
  return issues.map((i) => `${i.code}: ${i.message}`).join(" ");
};

const readLinesUntilDone = async (filePath: string): Promise<string[]> => {
  const storage = getStorage();
  const content = await storage.readFile(filePath);
  const allLines = content.split("\n");

  const lines: string[] = [];
  let sawSkaters = false;
  let sawGoalies = false;

  for (const line of allLines) {
    lines.push(line);

    const trimmed = normalizeLine(line);
    if (trimmed === EXPECTED_SKATERS_MARKER) sawSkaters = true;
    if (trimmed === EXPECTED_GOALIES_MARKER) sawGoalies = true;

    // Once both markers have been seen, a few extra lines are enough to capture headers.
    if (sawSkaters && sawGoalies) {
      // Keep reading a couple more lines in case goalies header is right after marker.
      if (lines.length > 200) break;
    }

    if (lines.length > 300) break;
  }

  return lines;
};

const validatedFiles = new Set<string>();

export const resetValidatedCsvFilesForTests = (): void => {
  validatedFiles.clear();
};

export const validateCsvFileOnceOrThrow = async (filePath: string): Promise<void> => {
  if (validatedFiles.has(filePath)) return;

  const lines = await readLinesUntilDone(filePath);
  const issues = validateNormalizedCsvLines(lines);
  if (issues.length) {
    throw new ApiError(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      `CSV integrity check failed for ${filePath}. ${formatIssues(issues)}`
    );
  }

  validatedFiles.add(filePath);
};
