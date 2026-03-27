import { TEAMS } from "../../config/index.js";
import {
  getOpeningDraftPicksFromDb,
  type OpeningDraftPickDbRow,
} from "../../db/queries.js";

export type DraftTeamRef = {
  id: string;
  name: string;
};

export type OriginalDraftPick = {
  round: number;
  pickNumber: number;
  draftedPlayer: string;
  originalOwner: DraftTeamRef;
};

export type OriginalDraftTeamGroup = {
  team: DraftTeamRef;
  picks: OriginalDraftPick[];
};

const TEAM_NAME_BY_ID = new Map(
  TEAMS.map((team) => [team.id, team.presentName] as const),
);

const toDraftTeamRef = (teamId: string): DraftTeamRef => ({
  id: teamId,
  name: TEAM_NAME_BY_ID.get(teamId) ?? teamId,
});

const compareOriginalDraftPicks = (
  left: OriginalDraftPick,
  right: OriginalDraftPick,
): number => left.pickNumber - right.pickNumber;

const compareOriginalDraftGroups = (
  left: OriginalDraftTeamGroup,
  right: OriginalDraftTeamGroup,
): number => left.team.name.localeCompare(right.team.name);

const mapOriginalDraftPick = (row: OpeningDraftPickDbRow): OriginalDraftPick => ({
  round: row.round,
  pickNumber: row.pickNumber,
  draftedPlayer: row.draftedPlayer,
  originalOwner: toDraftTeamRef(row.originalOwnerTeamId),
});

export const getOriginalDraftData = async (): Promise<OriginalDraftTeamGroup[]> => {
  const rows = await getOpeningDraftPicksFromDb();
  const groups = new Map<string, OriginalDraftTeamGroup>();

  for (const row of rows) {
    const pick = mapOriginalDraftPick(row);
    const existingGroup = groups.get(row.draftedTeamId);

    if (existingGroup) {
      existingGroup.picks.push(pick);
      continue;
    }

    groups.set(row.draftedTeamId, {
      team: toDraftTeamRef(row.draftedTeamId),
      picks: [pick],
    });
  }

  return [...groups.values()]
    .map((group) => ({
      team: group.team,
      picks: group.picks.slice().sort(compareOriginalDraftPicks),
    }))
    .sort(compareOriginalDraftGroups);
};
