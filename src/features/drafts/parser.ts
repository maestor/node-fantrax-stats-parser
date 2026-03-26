import path from "path";

import { TEAMS } from "../../config/index.js";

export type EntryDraftTeam = {
  abbreviation: string;
  teamId: string;
  teamName: string;
};

export type EntryDraftPick = {
  season: number;
  round: number;
  pickNumber: number;
  playerName: string | null;
  draftedTeam: EntryDraftTeam;
  originalOwnerTeam: EntryDraftTeam;
};

export const DEFAULT_ENTRY_DRAFT_OUT_DIR = path.resolve(
  "src",
  "playwright",
  ".fantrax",
  "drafts",
);

const JSON_LD_SCRIPT_PATTERN =
  /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/giu;
const PICK_LINE_PATTERN =
  /^(\d+)\.\s*([A-Z]{2,4})((?:\s*\([^)]*\))*)\s*-\s*(.+)$/u;
const PARENTHETICAL_PATTERN = /\(([^)]*)\)/gu;
const ABBREVIATION_TOKEN_PATTERN = /\b[A-Z]{2,4}\b/gu;
const SEASON_IN_TITLE_PATTERN = /entry draft\s+(\d{4})/iu;

const TEAM_ID_BY_ABBREVIATION = new Map<string, string>([
  ["ANA", "12"],
  ["ARI", "31"],
  ["BOS", "18"],
  ["BUF", "21"],
  ["CAR", "2"],
  ["CBJ", "27"],
  ["CGY", "3"],
  ["CHI", "13"],
  ["COL", "1"],
  ["DAL", "29"],
  ["DET", "6"],
  ["EDM", "7"],
  ["FLA", "17"],
  ["LAK", "11"],
  ["MIN", "14"],
  ["MTL", "5"],
  ["NJD", "24"],
  ["NSH", "10"],
  ["NYI", "23"],
  ["NYR", "9"],
  ["OTT", "20"],
  ["PHI", "22"],
  ["PHX", "31"],
  ["PIT", "26"],
  ["SEA", "28"],
  ["SJS", "8"],
  ["STL", "15"],
  ["TBL", "16"],
  ["TOR", "19"],
  ["UTA", "31"],
  ["VAN", "4"],
  ["VGK", "32"],
  ["WPG", "30"],
  ["WSH", "25"],
]);
const TEAM_NAME_BY_ID = new Map(
  TEAMS.map((team) => [team.id, team.presentName] as const),
);

type ThreadStructuredData = {
  title: string;
  body: string;
};

const extractThreadStructuredData = (html: string): ThreadStructuredData => {
  for (const match of html.matchAll(JSON_LD_SCRIPT_PATTERN)) {
    const rawJson = match[1]?.trim();
    if (!rawJson) {
      continue;
    }

    let parsedJson: unknown;

    try {
      parsedJson = JSON.parse(rawJson);
    } catch {
      continue;
    }

    const entries = Array.isArray(parsedJson) ? parsedJson : [parsedJson];

    for (const entry of entries) {
      if (typeof entry !== "object" || entry === null) {
        continue;
      }

      const record = entry as Record<string, unknown>;
      const rawType = record["@type"];
      const types = Array.isArray(rawType) ? rawType : [rawType];
      const isDiscussionPosting = types.includes("DiscussionForumPosting");

      if (
        isDiscussionPosting &&
        typeof record.headline === "string" &&
        typeof record.articleBody === "string"
      ) {
        return {
          title: record.headline.trim(),
          body: record.articleBody.replace(/\r\n?/gu, "\n"),
        };
      }
    }
  }

  throw new Error(
    "Could not extract entry-draft title/body from the forum thread HTML.",
  );
};

const parseSeasonFromTitle = (title: string): number => {
  const seasonMatch = SEASON_IN_TITLE_PATTERN.exec(title.trim());
  if (!seasonMatch) {
    throw new Error(`Could not determine draft season from title: ${title}`);
  }

  return Number.parseInt(seasonMatch[1], 10);
};

const resolveTeamFromAbbreviation = (rawAbbreviation: string): EntryDraftTeam => {
  const abbreviation = rawAbbreviation.trim().toUpperCase();
  const teamId = TEAM_ID_BY_ABBREVIATION.get(abbreviation);
  if (!teamId) {
    throw new Error(`Unsupported team abbreviation in entry draft: ${abbreviation}`);
  }

  return {
    abbreviation,
    teamId,
    teamName: TEAM_NAME_BY_ID.get(teamId)!,
  };
};

const resolveOriginalOwnerAbbreviation = (
  rawParentheticalSegment: string,
  draftedTeamAbbreviation: string,
): string => {
  for (const parentheticalMatch of rawParentheticalSegment.matchAll(
    PARENTHETICAL_PATTERN,
  )) {
    const content = parentheticalMatch[1].trim().toUpperCase();
    if (!content) {
      continue;
    }

    for (const tokenMatch of content.matchAll(ABBREVIATION_TOKEN_PATTERN)) {
      const abbreviation = tokenMatch[0];
      if (TEAM_ID_BY_ABBREVIATION.has(abbreviation)) {
        return abbreviation;
      }
    }
  }

  return draftedTeamAbbreviation;
};

const parseDraftBody = (body: string, season: number): EntryDraftPick[] => {
  if (!body.trim()) {
    throw new Error("Draft first-post body was empty.");
  }
  const normalizedBody = body.replace(/\r\n?/gu, "\n");

  const picks: EntryDraftPick[] = [];
  let round = 0;

  for (const block of normalizedBody.split(/\n\s*\n+/u)) {
    const lines = block
      .split("\n")
      .filter((line) => line.trim().length > 0);
    let sawPickInBlock = false;

    for (const line of lines) {
      const normalizedLine = line.trimStart();
      const pickMatch = PICK_LINE_PATTERN.exec(normalizedLine);
      if (!pickMatch) {
        continue;
      }

      if (!sawPickInBlock) {
        round += 1;
        sawPickInBlock = true;
      }

      const pickNumber = Number.parseInt(pickMatch[1], 10);
      const draftedTeamAbbreviation = pickMatch[2];
      const originalOwnerTeamAbbreviation = resolveOriginalOwnerAbbreviation(
        pickMatch[3],
        draftedTeamAbbreviation,
      );
      const rawPlayerName = pickMatch[4].trim();

      if (!rawPlayerName) {
        throw new Error(
          `Draft pick row was missing a player name: ${normalizedLine}`,
        );
      }
      const playerName = rawPlayerName === "SKIPATTU" ? null : rawPlayerName;

      picks.push({
        season,
        round,
        pickNumber,
        playerName,
        draftedTeam: resolveTeamFromAbbreviation(draftedTeamAbbreviation),
        originalOwnerTeam: resolveTeamFromAbbreviation(
          originalOwnerTeamAbbreviation,
        ),
      });
    }
  }

  if (!picks.length) {
    throw new Error("Could not find any draft pick rows in the first-post body.");
  }

  return picks;
};

export const parseEntryDraftHtml = (
  html: string,
): { season: number; picks: EntryDraftPick[] } => {
  const { title, body } = extractThreadStructuredData(html);
  const season = parseSeasonFromTitle(title);

  return {
    season,
    picks: parseDraftBody(body, season),
  };
};

export const buildEntryDraftOutputPath = (args: {
  outDir: string;
  season: number;
}): string => path.resolve(args.outDir, `entry-draft-${args.season}.json`);
