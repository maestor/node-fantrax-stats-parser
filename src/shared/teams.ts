import { DEFAULT_TEAM_ID, START_SEASON, TEAMS } from "../config/settings";

const isConfiguredTeamId = (teamId: string): boolean =>
  TEAMS.some((team) => team.id === teamId);

export const getTeamStartSeason = (teamId: string): number =>
  TEAMS.find((team) => team.id === teamId)?.firstSeason ?? START_SEASON;

export const getTeamsWithData = (): Array<(typeof TEAMS)[number]> => [...TEAMS];

export const resolveTeamId = (raw: unknown): string => {
  if (typeof raw !== "string") return DEFAULT_TEAM_ID;
  const teamId = raw.trim();
  if (!teamId) return DEFAULT_TEAM_ID;
  if (!isConfiguredTeamId(teamId)) return DEFAULT_TEAM_ID;
  return teamId;
};
