import { TEAMS } from "../../config/index.js";
import {
  getEntryDraftPicksFromDb,
  type EntryDraftPickDbRow,
  getOpeningDraftPicksFromDb,
  type OpeningDraftPickDbRow,
} from "../../db/queries.js";

export type DraftTeamRef = {
  id: string;
  name: string;
};

export type DraftPick = {
  round: number;
  pickNumber: number;
  draftedPlayer: string;
  originalOwner: DraftTeamRef;
};

export type OpeningDraftTeamGroup = {
  team: DraftTeamRef;
  picks: DraftPick[];
};

export type EntryDraftSeasonGroup = {
  season: number;
  picks: DraftPick[];
};

export type EntryDraftTeamGroup = {
  team: DraftTeamRef;
  seasons: EntryDraftSeasonGroup[];
};

const TEAM_NAME_BY_ID = new Map(
  TEAMS.map((team) => [team.id, team.presentName] as const),
);

const toDraftTeamRef = (teamId: string): DraftTeamRef => ({
  id: teamId,
  name: TEAM_NAME_BY_ID.get(teamId) ?? teamId,
});

const compareDraftPicks = (
  left: DraftPick,
  right: DraftPick,
): number => left.pickNumber - right.pickNumber;

const compareDraftTeamGroups = (
  left: { team: DraftTeamRef },
  right: { team: DraftTeamRef },
): number => left.team.name.localeCompare(right.team.name);

const compareEntryDraftSeasons = (
  left: EntryDraftSeasonGroup,
  right: EntryDraftSeasonGroup,
): number => right.season - left.season;

type DraftPickDbRow = Pick<
  OpeningDraftPickDbRow,
  "round" | "pickNumber" | "draftedPlayer" | "originalOwnerTeamId"
> &
  Partial<Pick<EntryDraftPickDbRow, "season" | "draftedTeamId">>;

const mapDraftPick = (row: DraftPickDbRow): DraftPick => ({
  round: row.round,
  pickNumber: row.pickNumber,
  draftedPlayer: row.draftedPlayer,
  originalOwner: toDraftTeamRef(row.originalOwnerTeamId),
});

export const getOriginalDraftData = async (): Promise<OpeningDraftTeamGroup[]> => {
  const rows = await getOpeningDraftPicksFromDb();
  const groups = new Map<string, OpeningDraftTeamGroup>();

  for (const row of rows) {
    const pick = mapDraftPick(row);
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
      picks: group.picks.slice().sort(compareDraftPicks),
    }))
    .sort(compareDraftTeamGroups);
};

export const getEntryDraftData = async (): Promise<EntryDraftTeamGroup[]> => {
  const rows = await getEntryDraftPicksFromDb();
  const teams = new Map<
    string,
    {
      team: DraftTeamRef;
      seasons: Map<number, DraftPick[]>;
    }
  >();

  for (const row of rows) {
    const existingTeam = teams.get(row.draftedTeamId);
    const team =
      existingTeam ??
      {
        team: toDraftTeamRef(row.draftedTeamId),
        seasons: new Map<number, DraftPick[]>(),
      };
    const seasonPicks = team.seasons.get(row.season);

    if (seasonPicks) {
      seasonPicks.push(mapDraftPick(row));
    } else {
      team.seasons.set(row.season, [mapDraftPick(row)]);
    }

    if (!existingTeam) {
      teams.set(row.draftedTeamId, team);
    }
  }

  return [...teams.values()]
    .map((team) => ({
      team: team.team,
      seasons: [...team.seasons.entries()]
        .map(([season, picks]) => ({
          season,
          picks: picks.slice().sort(compareDraftPicks),
        }))
        .sort(compareEntryDraftSeasons),
    }))
    .sort(compareDraftTeamGroups);
};
