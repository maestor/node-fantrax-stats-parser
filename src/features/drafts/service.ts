import { TEAMS } from "../../config/index.js";
import {
  getEntryDraftPicksFromDb,
  getOpeningDraftPicksFromDb,
  type EntryDraftPickDbRow,
} from "../../db/queries.js";

export type DraftTeamRef = {
  id: string;
  name: string;
};

export type DraftPick = {
  round: number;
  pickNumber: number;
  draftedPlayer: string | null;
  playedInLeague: boolean;
  playedForDraftingTeam: boolean;
  originalOwner: DraftTeamRef;
};

export type OpeningDraftPick = Omit<
  DraftPick,
  "draftedPlayer" | "playedInLeague" | "playedForDraftingTeam"
> & { draftedPlayer: string };

export type OpeningDraftTeamGroup = {
  team: DraftTeamRef;
  picks: OpeningDraftPick[];
};

export type EntryDraftSeasonGroup = {
  season: number;
  picks: DraftPick[];
};

export type EntryDraftHighestPickItem = {
  season: number;
  round: number;
  draftedPlayer: string;
};

export type EntryDraftRoundsSummary = {
  first: number;
  second: number;
  third: number;
  fourth: number;
  fifth: number;
};

export type EntryDraftTeamSummary = {
  highestPick:
    | {
        pickNumber: number;
        items: EntryDraftHighestPickItem[];
      }
    | null;
  averageDraftPosition: number | null;
  amounts: {
    total: number;
    ownPicks: number;
    tradedPicks: number;
    playersPerDraftAverage: number;
    playedInLeague: number;
    playedInLeaguePercent: number;
    playedForDraftingTeam: number;
    playedForDraftingTeamPercent: number;
  };
  rounds: EntryDraftRoundsSummary;
};

export type EntryDraftTeamGroup = {
  team: DraftTeamRef;
  summary: EntryDraftTeamSummary;
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
  left: { pickNumber: number },
  right: { pickNumber: number },
): number => left.pickNumber - right.pickNumber;

const compareDraftTeamGroups = (
  left: { team: DraftTeamRef },
  right: { team: DraftTeamRef },
): number => left.team.name.localeCompare(right.team.name);

const compareEntryDraftSeasons = (
  left: EntryDraftSeasonGroup,
  right: EntryDraftSeasonGroup,
): number => right.season - left.season;

const compareHighestPickItems = (
  left: EntryDraftHighestPickItem,
  right: EntryDraftHighestPickItem,
): number => right.season - left.season;

type EntryDraftSeasonGroupInternal = {
  season: number;
  picks: DraftPick[];
};

const mapEntryDraftPick = (row: EntryDraftPickDbRow): DraftPick => ({
  round: row.round,
  pickNumber: row.pickNumber,
  draftedPlayer: row.draftedPlayer,
  playedInLeague: row.playedInLeague,
  playedForDraftingTeam: row.playedForDraftingTeam,
  originalOwner: toDraftTeamRef(row.originalOwnerTeamId),
});

const mapOpeningDraftPick = (row: {
  round: number;
  pickNumber: number;
  draftedPlayer: string;
  originalOwnerTeamId: string;
}): OpeningDraftPick => ({
  round: row.round,
  pickNumber: row.pickNumber,
  draftedPlayer: row.draftedPlayer,
  originalOwner: toDraftTeamRef(row.originalOwnerTeamId),
});

type DraftedEntryPick = DraftPick & {
  season: number;
  draftedPlayer: string;
};

const toDraftPickResponse = (pick: DraftPick): DraftPick => ({
  round: pick.round,
  pickNumber: pick.pickNumber,
  draftedPlayer: pick.draftedPlayer,
  playedInLeague: pick.playedInLeague,
  playedForDraftingTeam: pick.playedForDraftingTeam,
  originalOwner: pick.originalOwner,
});

const roundDraftAverage = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const roundDraftPercent = (count: number, total: number): number =>
  total > 0 ? Math.round(((count / total) + Number.EPSILON) * 1000) / 1000 : 0;

const isDraftedEntryPick = (
  pick: DraftPick & { season: number },
): pick is DraftedEntryPick => pick.draftedPlayer !== null;

const buildRoundsSummary = (
  picks: readonly DraftedEntryPick[],
): EntryDraftRoundsSummary => ({
  first: picks.filter((pick) => pick.round === 1).length,
  second: picks.filter((pick) => pick.round === 2).length,
  third: picks.filter((pick) => pick.round === 3).length,
  fourth: picks.filter((pick) => pick.round === 4).length,
  fifth: picks.filter((pick) => pick.round === 5).length,
});

const buildEntryDraftTeamSummary = (
  teamId: string,
  seasons: readonly EntryDraftSeasonGroupInternal[],
): EntryDraftTeamSummary => {
  const picksWithSeason = seasons.flatMap((season) =>
    season.picks.map((pick) => ({
      season: season.season,
      ...pick,
    })),
  );
  const draftedPicks = picksWithSeason.filter(isDraftedEntryPick);
  const total = draftedPicks.length;
  const ownPicks = draftedPicks.filter(
    (pick) => pick.originalOwner.id === teamId,
  ).length;
  const playedInLeague = draftedPicks.filter((pick) => pick.playedInLeague).length;
  const playedForDraftingTeam = draftedPicks.filter(
    (pick) => pick.playedForDraftingTeam,
  ).length;
  const highestPickNumber =
    draftedPicks.length > 0
      ? Math.min(...draftedPicks.map((pick) => pick.pickNumber))
      : null;

  return {
    highestPick:
      highestPickNumber === null
        ? null
        : {
            pickNumber: highestPickNumber,
            items: draftedPicks
              .filter((pick) => pick.pickNumber === highestPickNumber)
              .map((pick) => ({
                season: pick.season,
                round: pick.round,
                draftedPlayer: pick.draftedPlayer,
              }))
              .sort(compareHighestPickItems),
          },
    averageDraftPosition:
      draftedPicks.length > 0
        ? roundDraftAverage(
            draftedPicks.reduce((sum, pick) => sum + pick.pickNumber, 0) / total,
          )
        : null,
    amounts: {
      total,
      ownPicks,
      tradedPicks: total - ownPicks,
      playersPerDraftAverage: roundDraftAverage(total / seasons.length),
      playedInLeague,
      playedInLeaguePercent: roundDraftPercent(playedInLeague, total),
      playedForDraftingTeam,
      playedForDraftingTeamPercent: roundDraftPercent(
        playedForDraftingTeam,
        total,
      ),
    },
    rounds: buildRoundsSummary(draftedPicks),
  };
};

export const getOriginalDraftData = async (): Promise<OpeningDraftTeamGroup[]> => {
  const rows = await getOpeningDraftPicksFromDb();
  const groups = new Map<string, OpeningDraftTeamGroup>();

  for (const row of rows) {
    const pick = mapOpeningDraftPick(row);
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
    const pick = mapEntryDraftPick(row);
    const seasonPicks = team.seasons.get(row.season);

    if (seasonPicks) {
      seasonPicks.push(pick);
    } else {
      team.seasons.set(row.season, [pick]);
    }

    if (!existingTeam) {
      teams.set(row.draftedTeamId, team);
    }
  }

  return [...teams.values()]
    .map((team) => {
      const seasons = [...team.seasons.entries()]
        .map(([season, picks]) => ({
          season,
          picks: picks.slice().sort(compareDraftPicks),
        }))
        .sort(compareEntryDraftSeasons);

      return {
        team: team.team,
        summary: buildEntryDraftTeamSummary(team.team.id, seasons),
        seasons: seasons.map((season) => ({
          season: season.season,
          picks: season.picks.map(toDraftPickResponse),
        })),
      };
    })
    .sort(compareDraftTeamGroups);
};
