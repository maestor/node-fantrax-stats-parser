import type { EntryDraftPick } from "./parser.js";

export type FantraxEntityCandidate = {
  fantraxId: string;
  name: string;
  lastSeenSeason: number;
};

export type EntryDraftEntityMappingRecord = {
  id: number;
  season: number;
  pickNumber: number;
  draftedTeamId: string;
  fantraxEntityId: string;
  fantraxEntityName: string;
};

export type DraftEntityMatchStatus =
  | "matched_exact_name"
  | "matched_latest_last_seen"
  | "unresolved_missing_entity"
  | "unresolved_ambiguous_entity"
  | "skipped_null_player";

export type DraftEntityMatchResult = {
  season: number;
  pickNumber: number;
  draftedTeamId: string;
  playerName: string | null;
  status: DraftEntityMatchStatus;
  fantraxEntityId: string | null;
  fantraxEntityName: string | null;
  candidateNames: string[];
};

export type EntryDraftEntityGenerationReport = {
  generatedMappings: EntryDraftEntityMappingRecord[];
  results: DraftEntityMatchResult[];
  matchedCount: number;
  unresolvedCount: number;
  ambiguousCount: number;
  skippedCount: number;
};

/** @internal Test-only export for draft entity name normalization coverage. */
export const normalizeDraftEntityName = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/['’]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();

const buildCandidateLookup = (
  entities: readonly FantraxEntityCandidate[],
): ReadonlyMap<string, FantraxEntityCandidate[]> => {
  const byName = new Map<string, FantraxEntityCandidate[]>();

  for (const entity of entities) {
    const normalizedName = normalizeDraftEntityName(entity.name);
    if (!normalizedName) {
      continue;
    }

    const existing = byName.get(normalizedName);
    if (existing) {
      existing.push(entity);
    } else {
      byName.set(normalizedName, [entity]);
    }
  }

  return byName;
};

const compareCandidates = (
  left: FantraxEntityCandidate,
  right: FantraxEntityCandidate,
): number =>
  right.lastSeenSeason - left.lastSeenSeason ||
  left.name.localeCompare(right.name) ||
  left.fantraxId.localeCompare(right.fantraxId);

const chooseCandidate = (
  candidates: readonly FantraxEntityCandidate[],
):
  | { status: "matched_exact_name" | "matched_latest_last_seen"; candidate: FantraxEntityCandidate }
  | { status: "unresolved_missing_entity" | "unresolved_ambiguous_entity"; candidate: null } => {
  if (candidates.length === 0) {
    return { status: "unresolved_missing_entity", candidate: null };
  }

  const sorted = [...candidates].sort(compareCandidates);
  if (sorted.length === 1) {
    return { status: "matched_exact_name", candidate: sorted[0] };
  }

  const latest = sorted[0];
  const next = sorted[1];

  if (latest.lastSeenSeason > next.lastSeenSeason) {
    return { status: "matched_latest_last_seen", candidate: latest };
  }

  return { status: "unresolved_ambiguous_entity", candidate: null };
};

export const generateEntryDraftEntityMappings = (args: {
  picks: readonly EntryDraftPick[];
  entities: readonly FantraxEntityCandidate[];
}): EntryDraftEntityGenerationReport => {
  const candidatesByName = buildCandidateLookup(args.entities);
  const results: DraftEntityMatchResult[] = [];
  const generatedMappings: EntryDraftEntityMappingRecord[] = [];
  let matchedCount = 0;
  let unresolvedCount = 0;
  let ambiguousCount = 0;
  let skippedCount = 0;

  for (const pick of args.picks) {
    const baseResult = {
      season: pick.season,
      pickNumber: pick.pickNumber,
      draftedTeamId: pick.draftedTeam.teamId,
      playerName: pick.playerName,
    };

    if (pick.playerName === null) {
      skippedCount += 1;
      results.push({
        ...baseResult,
        status: "skipped_null_player",
        fantraxEntityId: null,
        fantraxEntityName: null,
        candidateNames: [],
      });
      continue;
    }

    const normalizedName = normalizeDraftEntityName(pick.playerName);
    const candidates = candidatesByName.get(normalizedName) ?? [];
    const resolution = chooseCandidate(candidates);

    if (resolution.candidate) {
      matchedCount += 1;
      generatedMappings.push({
        id: generatedMappings.length + 1,
        season: pick.season,
        pickNumber: pick.pickNumber,
        draftedTeamId: pick.draftedTeam.teamId,
        fantraxEntityId: resolution.candidate.fantraxId,
        fantraxEntityName: resolution.candidate.name,
      });
      results.push({
        ...baseResult,
        status: resolution.status,
        fantraxEntityId: resolution.candidate.fantraxId,
        fantraxEntityName: resolution.candidate.name,
        candidateNames: candidates.map((candidate) => candidate.name),
      });
      continue;
    }

    if (resolution.status === "unresolved_ambiguous_entity") {
      ambiguousCount += 1;
    } else {
      unresolvedCount += 1;
    }

    results.push({
      ...baseResult,
      status: resolution.status,
      fantraxEntityId: null,
      fantraxEntityName: null,
      candidateNames: candidates.map((candidate) => candidate.name),
    });
  }

  return {
    generatedMappings,
    results,
    matchedCount,
    unresolvedCount,
    ambiguousCount,
    skippedCount,
  };
};
