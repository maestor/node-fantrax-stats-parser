import fs from "fs";
import os from "os";
import path from "path";

import {
  EXPECTED_GOALIES_HEADER,
  EXPECTED_GOALIES_HEADER_WG,
  EXPECTED_GOALIES_MARKER,
  EXPECTED_SKATERS_HEADER,
  EXPECTED_SKATERS_MARKER,
  resetValidatedCsvFilesForTests,
  validateCsvFileOnceOrThrow,
  validateNormalizedCsvLines,
} from "../csvIntegrity";

describe("csvIntegrity", () => {
  beforeEach(() => {
    resetValidatedCsvFilesForTests();
  });

  test("validateNormalizedCsvLines returns no issues for expected normalized format", () => {
    const issues = validateNormalizedCsvLines([
      EXPECTED_SKATERS_MARKER,
      EXPECTED_SKATERS_HEADER,
      '"F","Someone","COL","F","Act","","1","0","0","0","0","0","0","0","0","0","0"',
      EXPECTED_GOALIES_MARKER,
      EXPECTED_GOALIES_HEADER_WG,
      '"G","Someone","COL","G","Act","","1","1","2.00","10",".909","0","0","0","0","0","0","0"',
    ]);

    expect(issues).toEqual([]);
  });

  test("validateNormalizedCsvLines detects unexpected headers", () => {
    const issues = validateNormalizedCsvLines([
      EXPECTED_SKATERS_MARKER,
      '"Pos","Player"',
      EXPECTED_GOALIES_MARKER,
      EXPECTED_GOALIES_HEADER,
    ]);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unexpected_skaters_header" }),
      ])
    );
  });

  test("validateNormalizedCsvLines detects unexpected goalies header", () => {
    const issues = validateNormalizedCsvLines([
      EXPECTED_SKATERS_MARKER,
      EXPECTED_SKATERS_HEADER,
      EXPECTED_GOALIES_MARKER,
      '"Pos","Player"',
    ]);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unexpected_goalies_header" }),
      ])
    );
  });

  test("validateNormalizedCsvLines detects missing skaters header", () => {
    const issues = validateNormalizedCsvLines([EXPECTED_SKATERS_MARKER]);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing_skaters_header" }),
      ])
    );
  });

  test("validateNormalizedCsvLines detects missing markers when input is empty", () => {
    const issues = validateNormalizedCsvLines([]);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing_skaters_marker" }),
        expect.objectContaining({ code: "missing_goalies_marker" }),
      ])
    );
  });

  test("validateNormalizedCsvLines detects missing skaters marker when only goalies section exists", () => {
    const issues = validateNormalizedCsvLines([EXPECTED_GOALIES_MARKER, EXPECTED_GOALIES_HEADER]);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing_skaters_marker" }),
      ])
    );
  });

  test("validateNormalizedCsvLines detects missing goalies marker and goalies header", () => {
    const issuesMissingMarker = validateNormalizedCsvLines([
      EXPECTED_SKATERS_MARKER,
      EXPECTED_SKATERS_HEADER,
    ]);
    expect(issuesMissingMarker).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing_goalies_marker" }),
      ])
    );

    const issuesMissingHeader = validateNormalizedCsvLines([
      EXPECTED_SKATERS_MARKER,
      EXPECTED_SKATERS_HEADER,
      EXPECTED_GOALIES_MARKER,
    ]);
    expect(issuesMissingHeader).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing_goalies_header" }),
      ])
    );
  });

  test("validateCsvFileOnceOrThrow validates file only once per process", async () => {
    const tmp = path.join(os.tmpdir(), `fantrax-${Date.now()}-${Math.random()}.csv`);
    const content = [
      EXPECTED_SKATERS_MARKER,
      EXPECTED_SKATERS_HEADER,
      '"Totals","","","","","","0","0","0","0","0","0","0","0","0","0","0"',
      EXPECTED_GOALIES_MARKER,
      EXPECTED_GOALIES_HEADER,
      '"Totals","","","","","","0","0","0","0","0","0","0","0","0","0","0","0"',
    ].join("\n");

    fs.writeFileSync(tmp, content, "utf8");

    const spy = jest.spyOn(fs, "createReadStream");

    await validateCsvFileOnceOrThrow(tmp);
    await validateCsvFileOnceOrThrow(tmp);

    expect(spy).toHaveBeenCalledTimes(1);

    spy.mockRestore();
    fs.unlinkSync(tmp);
  });

  test("validateCsvFileOnceOrThrow throws for invalid file", async () => {
    const tmp = path.join(os.tmpdir(), `fantrax-bad-${Date.now()}-${Math.random()}.csv`);
    fs.writeFileSync(tmp, [EXPECTED_SKATERS_MARKER, '"bad"'].join("\n"), "utf8");

    await expect(validateCsvFileOnceOrThrow(tmp)).rejects.toEqual(
      expect.objectContaining({ statusCode: 500 })
    );

    fs.unlinkSync(tmp);
  });

  test("validateCsvFileOnceOrThrow stops reading after >200 lines once both sections are found", async () => {
    const tmp = path.join(os.tmpdir(), `fantrax-long-${Date.now()}-${Math.random()}.csv`);
    const filler = Array.from({ length: 260 }, () => '"x"').join("\n");
    const content = [
      EXPECTED_SKATERS_MARKER,
      EXPECTED_SKATERS_HEADER,
      '"F","Someone","COL","F","Act","","1","0","0","0","0","0","0","0","0","0","0"',
      EXPECTED_GOALIES_MARKER,
      EXPECTED_GOALIES_HEADER,
      '"G","Someone","COL","G","Act","","1","1","2.00","10",".909","0","0","0","0","0","0","0"',
      filler,
    ].join("\n");

    fs.writeFileSync(tmp, content, "utf8");
    await expect(validateCsvFileOnceOrThrow(tmp)).resolves.toBeUndefined();
    fs.unlinkSync(tmp);
  });

  test("validateCsvFileOnceOrThrow stops reading after >300 lines even if goalies section is missing", async () => {
    const tmp = path.join(os.tmpdir(), `fantrax-long-missing-${Date.now()}-${Math.random()}.csv`);
    const filler = Array.from({ length: 310 }, () => '"x"').join("\n");
    const content = [EXPECTED_SKATERS_MARKER, EXPECTED_SKATERS_HEADER, filler].join("\n");

    fs.writeFileSync(tmp, content, "utf8");
    await expect(validateCsvFileOnceOrThrow(tmp)).rejects.toEqual(
      expect.objectContaining({ statusCode: 500 })
    );
    fs.unlinkSync(tmp);
  });
});
