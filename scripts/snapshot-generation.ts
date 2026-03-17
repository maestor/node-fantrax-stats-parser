import { TEAMS } from "../src/config";

export const SNAPSHOT_GENERATION_SCOPES = [
  "all",
  "career",
  "career-highlights",
  "leaderboard-playoffs",
  "leaderboard-regular",
  "stats",
  "transactions",
] as const;

const EXPLICIT_SNAPSHOT_GENERATION_SCOPES = SNAPSHOT_GENERATION_SCOPES.filter(
  (scope): scope is Exclude<SnapshotGenerationScope, "all"> => scope !== "all",
);

export type SnapshotGenerationScope =
  (typeof SNAPSHOT_GENERATION_SCOPES)[number];

export const SNAPSHOT_STATS_REPORT_TYPES = [
  "regular",
  "playoffs",
  "both",
] as const;

export type ExplicitSnapshotGenerationScope =
  (typeof EXPLICIT_SNAPSHOT_GENERATION_SCOPES)[number];

export type SnapshotStatsReportType =
  (typeof SNAPSHOT_STATS_REPORT_TYPES)[number];

export type SnapshotGenerationConfig = {
  scopes: ExplicitSnapshotGenerationScope[];
  statsReportTypes: SnapshotStatsReportType[];
  statsTeamIds: string[] | null;
  isFullGeneration: boolean;
};

const normalizeExplicitScopes = (
  scopes: readonly ExplicitSnapshotGenerationScope[],
): ExplicitSnapshotGenerationScope[] => {
  const selected = new Set(scopes);
  return EXPLICIT_SNAPSHOT_GENERATION_SCOPES.filter((scope) =>
    selected.has(scope),
  );
};

const parseScopeTokens = (args: readonly string[]): string[] =>
  args
    .filter((arg) => arg.startsWith("--scope="))
    .flatMap((arg) => arg.slice("--scope=".length).split(","))
    .map((value) => value.trim())
    .filter(Boolean);

const parseTeamIdTokens = (args: readonly string[]): string[] =>
  args
    .filter((arg) => arg.startsWith("--team-id="))
    .flatMap((arg) => arg.slice("--team-id=".length).split(","))
    .map((value) => value.trim())
    .filter(Boolean);

const normalizeStatsTeamIds = (teamIds: readonly string[]): string[] => {
  const selected = new Set(teamIds);
  return TEAMS.map((team) => team.id).filter((teamId) => selected.has(teamId));
};

export const resolveSnapshotStatsTeamIds = (
  args: readonly string[],
): string[] | null => {
  const rawTeamIds = parseTeamIdTokens(args);

  if (rawTeamIds.length === 0) {
    return null;
  }

  const uniqueTeamIds = new Set(rawTeamIds);
  const validTeamIds = new Set(TEAMS.map((team) => team.id));
  const invalidTeamId = [...uniqueTeamIds].find((teamId) => !validTeamIds.has(teamId));

  if (invalidTeamId) {
    throw new Error(
      `Invalid --team-id value: ${invalidTeamId}. Valid values: ${TEAMS.map((team) => team.id).join(", ")}.`,
    );
  }

  return normalizeStatsTeamIds([...uniqueTeamIds]);
};

export const resolveSnapshotStatsReportTypes = (
  rawValue?: string | null,
): SnapshotStatsReportType[] => {
  const value = rawValue?.trim();

  if (!value || value === "all") {
    return [...SNAPSHOT_STATS_REPORT_TYPES];
  }

  if (value === "regular") {
    return ["regular", "both"];
  }

  if (value === "playoffs") {
    return ["playoffs", "both"];
  }

  if (value === "both") {
    return ["both"];
  }

  throw new Error(
    `Invalid --report-type value: ${value}. Valid values: all, regular, playoffs, both.`,
  );
};

export const resolveSnapshotGenerationConfig = (
  args: readonly string[],
): SnapshotGenerationConfig => {
  const rawScopeTokens = parseScopeTokens(args);
  const reportTypeArgs = args.filter((arg) =>
    arg.startsWith("--report-type="),
  );
  const statsTeamIds = resolveSnapshotStatsTeamIds(args);

  if (reportTypeArgs.length > 1) {
    throw new Error("Use at most one --report-type value.");
  }

  const statsReportTypes = resolveSnapshotStatsReportTypes(
    reportTypeArgs[0]?.slice("--report-type=".length),
  );

  if (rawScopeTokens.length === 0) {
    return {
      scopes: [...EXPLICIT_SNAPSHOT_GENERATION_SCOPES],
      statsReportTypes,
      statsTeamIds,
      isFullGeneration:
        statsReportTypes.length === SNAPSHOT_STATS_REPORT_TYPES.length &&
        statsTeamIds === null,
    };
  }

  const uniqueScopes = new Set(rawScopeTokens);

  if (uniqueScopes.has("all") && uniqueScopes.size > 1) {
    throw new Error("Use --scope=all by itself, not together with other scopes.");
  }

  const invalidScope = [...uniqueScopes].find(
    (scope): scope is string =>
      !SNAPSHOT_GENERATION_SCOPES.includes(scope as SnapshotGenerationScope),
  );

  if (invalidScope) {
    throw new Error(
      `Invalid --scope value: ${invalidScope}. Valid values: ${SNAPSHOT_GENERATION_SCOPES.join(", ")}.`,
    );
  }

  const scopes = uniqueScopes.has("all")
    ? [...EXPLICIT_SNAPSHOT_GENERATION_SCOPES]
    : normalizeExplicitScopes(
        [...uniqueScopes] as ExplicitSnapshotGenerationScope[],
      );

  return {
    scopes,
    statsReportTypes,
    statsTeamIds,
    isFullGeneration:
      scopes.length === EXPLICIT_SNAPSHOT_GENERATION_SCOPES.length &&
      statsReportTypes.length === SNAPSHOT_STATS_REPORT_TYPES.length &&
      statsTeamIds === null,
  };
};
