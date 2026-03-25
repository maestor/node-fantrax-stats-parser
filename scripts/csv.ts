import fs from "fs/promises";
import { parse } from "csv-parse/sync";

export type CsvRow = Record<string, string>;

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

  const [headers, ...rows] = records;
  return rows.map((row) => mapCsvRow(headers, row) as TRow);
};
