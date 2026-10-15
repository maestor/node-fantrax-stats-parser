import { TEAMS } from "../../config/index.js";

export const EXPANSION_DRAFT_SOURCES = [
  {
    teamId: "32",
    url: "https://ffhl.kld.im/threads/vegasin-valinnat-2017.19/",
  },
  {
    teamId: "28",
    url: "https://ffhl.kld.im/threads/seattle-krakenin-valinnat-2021.1101/",
  },
] as const;

export type ExpansionDraft = {
  season: number;
  teamId: string;
  sourceUrl: string;
  picks: Array<{
    selectionNumber: number;
    sourceTeamId: string;
    playerName: string;
    position: "F" | "D" | "G" | null;
  }>;
};

const TEAM_IDS = new Map([
  ...TEAMS.map((team) => [team.teamAbbr, team.id] as const),
  ["ARI", "31"],
  ["MON", "5"],
  ["WIN", "30"],
]);

const firstPost = (html: string): string => {
  const opening = /<div\b[^>]*class="bbWrapper"[^>]*>/u.exec(html);
  if (opening) {
    const start = opening.index + opening[0].length;
    let depth = 1;
    for (const tag of html.slice(start).matchAll(/<\/?div\b[^>]*>/gu)) {
      depth += tag[0].startsWith("</") ? -1 : 1;
      if (depth === 0) return html.slice(start, start + tag.index);
    }
  }
  throw new Error("Could not extract the expansion draft's first forum post.");
};

const text = (html: string): string =>
  html
    .replace(/<[^>]*>/gu, "")
    .replace(/&nbsp;/gu, " ")
    .replace(/&amp;/gu, "&")
    .trim();

export const parseExpansionDraftHtml = (
  html: string,
  source: (typeof EXPANSION_DRAFT_SOURCES)[number],
): ExpansionDraft => {
  const body = firstPost(html);
  const picks: ExpansionDraft["picks"] = [];
  const lines = body.includes("<table")
    ? [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gu)].map((row) =>
        [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gu)]
          .map((cell) => text(cell[1]))
          .join("\t"),
      )
    : body
        .replace(/<br\s*\/?>/gu, "\n")
        .split("\n")
        .map(text);
  const sourceTeams = new Set<string>();
  for (const line of lines) {
    if (!line.trim() || /^(Ykköskori|Kakkoskori)/u.test(line)) continue;
    const match = body.includes("<table")
      ? /^([A-Z]{3})\t(FW|D|G)\t(.+)$/u.exec(line)
      : /^([A-Z]{3})\s+(.+?)(?:[,\s]+([fdgFDG]))?$/u.exec(line);
    if (!match) throw new Error(`Unrecognized expansion selection: ${line}`);
    const sourceTeamId = TEAM_IDS.get(match[1]);
    if (!sourceTeamId || sourceTeams.has(sourceTeamId)) {
      throw new Error(
        `Unknown or duplicate expansion source team: ${match[1]}`,
      );
    }
    sourceTeams.add(sourceTeamId);
    const table = body.includes("<table");
    picks.push({
      selectionNumber: picks.length + 1,
      sourceTeamId,
      playerName: table ? match[3] : match[2],
      position: table
        ? (match[2].replace("FW", "F") as "F" | "D" | "G")
        : match[3]
          ? (match[3].toUpperCase() as "F" | "D" | "G")
          : null,
    });
  }
  if (picks.length !== 30)
    throw new Error(`Expected 30 expansion selections; found ${picks.length}.`);
  return {
    season: TEAMS.find((team) => team.id === source.teamId)!.firstSeason!,
    teamId: source.teamId,
    sourceUrl: source.url,
    picks,
  };
};
