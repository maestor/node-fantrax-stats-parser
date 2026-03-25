import fs from "fs/promises";
import { parse } from "csv-parse/sync";

export type CsvRow = Record<string, string>;

const mapSectionedStatsCsvRow = (
  firstColumnKey: string,
  values: readonly string[],
): CsvRow => {
  const row: CsvRow = {
    [firstColumnKey]: values[0] ?? "",
  };

  for (let index = 1; index < values.length; index++) {
    row[`field${index + 1}`] = values[index] ?? "";
  }

  return row;
};

const mapCsvRow = (
  headers: readonly string[],
  values: readonly string[],
): CsvRow => {
  const row: CsvRow = {};

  for (let index = 0; index < headers.length; index++) {
    const header = headers[index]?.trim();
    if (!header) {
      continue;
    }

    // Preserve existing csvtojson behavior where later duplicate headers win.
    row[header] = values[index] ?? "";
  }

  return row;
};

const isSectionedStatsCsv = (records: readonly string[][]): boolean => {
  if (records.length < 2) {
    return false;
  }

  const firstRow = records[0];
  const secondRow = records[1];
  const firstCell = firstRow?.[0]?.trim();

  return (
    firstRow?.length === 1 &&
    firstCell !== undefined &&
    firstCell !== "" &&
    secondRow?.[0]?.trim() === "ID" &&
    secondRow.some((value) => value.trim() === "Pos")
  );
};

export const parseCsvFile = async <TRow extends CsvRow = CsvRow>(
  filePath: string,
): Promise<TRow[]> => {
  const input = await fs.readFile(filePath, "utf8");
  const records = parse(input, {
    bom: true,
    relax_column_count: true,
    skip_empty_lines: true,
  }) as string[][];

  if (records.length === 0) {
    return [];
  }

  if (isSectionedStatsCsv(records)) {
    const firstColumnKey = records[0]?.[0]?.trim() || "Skaters";
    return records.map(
      (row) => mapSectionedStatsCsvRow(firstColumnKey, row) as TRow,
    );
  }

  const [headers, ...rows] = records;
  return rows.map((row) => mapCsvRow(headers, row) as TRow);
};
