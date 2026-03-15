import type { InStatement } from "@libsql/client";

import type {
  GoalieWithSeason,
  PlayerWithSeason,
} from "../stats/types";

export type FantraxEntityPosition = "F" | "D" | "G";

export type FantraxEntity = {
  fantraxId: string;
  name: string;
  position: FantraxEntityPosition | null;
  firstSeenSeason: number;
  lastSeenSeason: number;
};

const FANTRAX_ENTITY_UPSERT_SQL = `INSERT INTO fantrax_entities (
  fantrax_id,
  name,
  position,
  first_seen_season,
  last_seen_season
) VALUES (?, ?, ?, ?, ?)
ON CONFLICT(fantrax_id) DO UPDATE SET
  first_seen_season = MIN(fantrax_entities.first_seen_season, excluded.first_seen_season),
  last_seen_season = MAX(fantrax_entities.last_seen_season, excluded.last_seen_season),
  name = CASE
    WHEN excluded.last_seen_season >= fantrax_entities.last_seen_season
      THEN excluded.name
    ELSE fantrax_entities.name
  END,
  position = CASE
    WHEN fantrax_entities.position IS NULL AND excluded.position IS NOT NULL
      THEN excluded.position
    WHEN excluded.last_seen_season >= fantrax_entities.last_seen_season
      THEN COALESCE(excluded.position, fantrax_entities.position)
    ELSE fantrax_entities.position
  END`;

const mergeFantraxEntity = (
  existing: FantraxEntity | undefined,
  incoming: FantraxEntity,
): FantraxEntity => {
  if (!existing) {
    return incoming;
  }

  const useIncomingCanonical =
    incoming.lastSeenSeason >= existing.lastSeenSeason;

  return {
    fantraxId: existing.fantraxId,
    name: useIncomingCanonical ? incoming.name : existing.name,
    position: useIncomingCanonical
      ? (incoming.position ?? existing.position ?? null)
      : (existing.position ?? incoming.position ?? null),
    firstSeenSeason: Math.min(existing.firstSeenSeason, incoming.firstSeenSeason),
    lastSeenSeason: Math.max(existing.lastSeenSeason, incoming.lastSeenSeason),
  };
};

export const collectFantraxEntitiesFromStats = (args: {
  players: readonly PlayerWithSeason[];
  goalies: readonly GoalieWithSeason[];
}): FantraxEntity[] => {
  const byId = new Map<string, FantraxEntity>();

  for (const player of args.players) {
    if (!player.id) {
      continue;
    }

    const incoming: FantraxEntity = {
      fantraxId: player.id,
      name: player.name,
      position:
        player.position === "F" || player.position === "D"
          ? player.position
          : null,
      firstSeenSeason: player.season,
      lastSeenSeason: player.season,
    };
    byId.set(player.id, mergeFantraxEntity(byId.get(player.id), incoming));
  }

  for (const goalie of args.goalies) {
    if (!goalie.id) {
      continue;
    }

    const incoming: FantraxEntity = {
      fantraxId: goalie.id,
      name: goalie.name,
      position: "G",
      firstSeenSeason: goalie.season,
      lastSeenSeason: goalie.season,
    };
    byId.set(goalie.id, mergeFantraxEntity(byId.get(goalie.id), incoming));
  }

  return [...byId.values()].sort((a, b) =>
    a.fantraxId.localeCompare(b.fantraxId),
  );
};

export const buildFantraxEntityUpsertStatements = (
  entities: readonly FantraxEntity[],
): InStatement[] =>
  entities.map((entity) => ({
    sql: FANTRAX_ENTITY_UPSERT_SQL,
    args: [
      entity.fantraxId,
      entity.name,
      entity.position,
      entity.firstSeenSeason,
      entity.lastSeenSeason,
    ],
  }));
