import { CAREER_HIGHLIGHT_TYPES } from "../config/index.js";
import {
  SNAPSHOT_GENERATION_SCOPES,
  SNAPSHOT_STATS_REPORT_TYPES,
  resolveSnapshotGenerationConfig,
  resolveSnapshotStatsReportTypes,
  resolveSnapshotStatsTeamIds,
} from "../../scripts/snapshot-generation.js";

describe("snapshot generation helpers", () => {
  test("exposes supported scopes and stats report types", () => {
    expect(SNAPSHOT_GENERATION_SCOPES).toEqual([
      "all",
      "career",
      "career-highlights",
      "leaderboard-playoffs",
      "leaderboard-regular",
      "stats",
      "transactions",
    ]);
    expect(SNAPSHOT_STATS_REPORT_TYPES).toEqual([
      "regular",
      "playoffs",
      "both",
    ]);
  });

  test("defaults to full generation for all scopes and all stats report types", () => {
    expect(resolveSnapshotGenerationConfig([])).toEqual({
      scopes: [
        "career",
        "career-highlights",
        "leaderboard-playoffs",
        "leaderboard-regular",
        "stats",
        "transactions",
      ],
      statsReportTypes: ["regular", "playoffs", "both"],
      careerHighlightTypes: [...CAREER_HIGHLIGHT_TYPES],
      statsTeamIds: null,
      isFullGeneration: true,
    });
  });

  test("normalizes explicit scopes and narrows stats report generation", () => {
    expect(
      resolveSnapshotGenerationConfig([
        "--scope=transactions",
        "--scope=stats",
        "--report-type=regular",
      ]),
    ).toEqual({
      scopes: ["stats", "transactions"],
      statsReportTypes: ["regular", "both"],
      careerHighlightTypes: [...CAREER_HIGHLIGHT_TYPES],
      statsTeamIds: null,
      isFullGeneration: false,
    });
  });

  test("supports comma-separated scopes and stats-only both generation", () => {
    expect(
      resolveSnapshotGenerationConfig([
        "--scope=career-highlights,leaderboard-regular",
        "--report-type=both",
      ]),
    ).toEqual({
      scopes: ["career-highlights", "leaderboard-regular"],
      statsReportTypes: ["both"],
      careerHighlightTypes: [...CAREER_HIGHLIGHT_TYPES],
      statsTeamIds: null,
      isFullGeneration: false,
    });
  });

  test("allows scope=all by itself", () => {
    expect(resolveSnapshotGenerationConfig(["--scope=all"])).toEqual({
      scopes: [
        "career",
        "career-highlights",
        "leaderboard-playoffs",
        "leaderboard-regular",
        "stats",
        "transactions",
      ],
      statsReportTypes: ["regular", "playoffs", "both"],
      careerHighlightTypes: [...CAREER_HIGHLIGHT_TYPES],
      statsTeamIds: null,
      isFullGeneration: true,
    });
  });

  test("supports targeted stats generation for selected teams", () => {
    expect(
      resolveSnapshotGenerationConfig([
        "--scope=stats",
        "--report-type=playoffs",
        "--team-id=12,1",
        "--team-id=12",
      ]),
    ).toEqual({
      scopes: ["stats"],
      statsReportTypes: ["playoffs", "both"],
      careerHighlightTypes: [...CAREER_HIGHLIGHT_TYPES],
      statsTeamIds: ["1", "12"],
      isFullGeneration: false,
    });
  });

  test("restricts career highlights without treating a partial refresh as full generation", () => {
    const config = resolveSnapshotGenerationConfig([
      "--scope=all",
      "--highlight-type=most-drops,most-claims",
      "--highlight-type=most-claims,reunion-king,most-trades",
    ]);
    expect(config.careerHighlightTypes).toEqual([
      "reunion-king",
      "most-trades",
      "most-claims",
      "most-drops",
    ]);
    expect(config.isFullGeneration).toBe(false);
  });

  test("rejects unknown highlight types and filters without the highlights scope", () => {
    expect(() =>
      resolveSnapshotGenerationConfig([
        "--scope=career-highlights",
        "--highlight-type=unknown",
      ]),
    ).toThrow("Invalid --highlight-type value: unknown");
    expect(() =>
      resolveSnapshotGenerationConfig([
        "--scope=stats",
        "--highlight-type=most-trades",
      ]),
    ).toThrow("--highlight-type requires the career-highlights scope");
  });

  test("maps stats report filters for manual callers", () => {
    expect(resolveSnapshotStatsReportTypes(undefined)).toEqual([
      "regular",
      "playoffs",
      "both",
    ]);
    expect(resolveSnapshotStatsReportTypes("all")).toEqual([
      "regular",
      "playoffs",
      "both",
    ]);
    expect(resolveSnapshotStatsReportTypes("regular")).toEqual([
      "regular",
      "both",
    ]);
    expect(resolveSnapshotStatsReportTypes("playoffs")).toEqual([
      "playoffs",
      "both",
    ]);
    expect(resolveSnapshotStatsReportTypes("both")).toEqual(["both"]);
  });

  test("maps stats team filters for manual callers", () => {
    expect(resolveSnapshotStatsTeamIds([])).toBeNull();
    expect(
      resolveSnapshotStatsTeamIds(["--team-id=12,1", "--team-id=12"]),
    ).toEqual(["1", "12"]);
  });

  test("rejects invalid scope combinations and values", () => {
    expect(() =>
      resolveSnapshotGenerationConfig(["--scope=all", "--scope=stats"]),
    ).toThrow("Use --scope=all by itself, not together with other scopes.");

    expect(() => resolveSnapshotGenerationConfig(["--scope=unknown"])).toThrow(
      "Invalid --scope value: unknown. Valid values: all, career, career-highlights, leaderboard-playoffs, leaderboard-regular, stats, transactions.",
    );
  });

  test("rejects invalid or duplicated report-type args", () => {
    expect(() => resolveSnapshotStatsReportTypes("invalid")).toThrow(
      "Invalid --report-type value: invalid. Valid values: all, regular, playoffs, both.",
    );

    expect(() =>
      resolveSnapshotGenerationConfig([
        "--report-type=regular",
        "--report-type=playoffs",
      ]),
    ).toThrow("Use at most one --report-type value.");
  });

  test("rejects invalid team ids", () => {
    expect(() => resolveSnapshotStatsTeamIds(["--team-id=999"])).toThrow(
      "Invalid --team-id value: 999. Valid values:",
    );
  });
});
