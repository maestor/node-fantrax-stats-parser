import type { Client, InStatement } from "@libsql/client";
import type { ExpansionDraft } from "./expansion-parser.js";
import { normalizeDraftEntityName } from "./entity-mappings.js";

const NAME_ALIASES = new Map([
  ["cj motte", "c.j. motte"],
  ["nick shore", "nicholas shore"],
  ["alex edler", "alexander edler"],
]);
const normalizedName = (name: string): string =>
  normalizeDraftEntityName(name).toLowerCase();

type Entity = { id: string; name: string; position: "F" | "D" | "G" | null };
type Match = {
  season: number;
  playerName: string;
  entityId: string | null;
  status:
    "matched" | "unresolved_missing_entity" | "unresolved_ambiguous_entity";
};

export const importExpansionDraftsToDb = async (args: {
  db: Pick<Client, "execute" | "batch">;
  drafts: readonly ExpansionDraft[];
  dryRun?: boolean;
  importedAt?: string;
}) => {
  const result = await args.db.execute(
    "SELECT fantrax_id, name, position FROM fantrax_entities",
  );
  const entities = new Map<string, Entity[]>();
  for (const row of result.rows) {
    const key = normalizedName(String(row.name));
    const group = entities.get(key) ?? [];
    group.push({
      id: String(row.fantrax_id),
      name: String(row.name),
      position: row.position as Entity["position"],
    });
    entities.set(key, group);
  }
  const matches: Match[] = [];
  const statements: InStatement[] = [];
  for (const draft of args.drafts) {
    statements.push({
      sql: "DELETE FROM expansion_draft_picks WHERE season = ? AND expansion_team_id = ?",
      args: [draft.season, draft.teamId],
    });
    for (const pick of draft.picks) {
      const key = normalizedName(pick.playerName);
      const candidates = entities.get(NAME_ALIASES.get(key) ?? key) ?? [];
      const entity = candidates.length === 1 ? candidates[0] : null;
      const position = entity?.position ?? pick.position;
      if (position === null)
        throw new Error(
          `Cannot determine expansion position for ${pick.playerName}. Correct the forum post or entity before importing.`,
        );
      matches.push({
        season: draft.season,
        playerName: pick.playerName,
        entityId: entity?.id ?? null,
        status: entity
          ? "matched"
          : candidates.length
            ? "unresolved_ambiguous_entity"
            : "unresolved_missing_entity",
      });
      statements.push({
        sql: `INSERT INTO expansion_draft_picks
          (season, selection_number, expansion_team_id, source_team_id, raw_player_name,
           player_name, position, fantrax_entity_id, source_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          draft.season,
          pick.selectionNumber,
          draft.teamId,
          pick.sourceTeamId,
          pick.playerName,
          entity?.name ?? pick.playerName,
          position,
          entity?.id ?? null,
          draft.sourceUrl,
        ],
      });
    }
  }
  if (!args.dryRun) {
    statements.push({
      sql: "INSERT OR REPLACE INTO import_metadata (key, value) VALUES ('last_modified', ?)",
      args: [args.importedAt ?? new Date().toISOString()],
    });
    await args.db.batch(statements, "write");
  }
  return {
    dryRun: args.dryRun ?? false,
    selectionCount: matches.length,
    matchedCount: matches.filter((match) => match.status === "matched").length,
    unresolved: matches.filter((match) => match.status !== "matched"),
  };
};
