import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { buildRosterCsvUrlForSeason } from "../features/fantrax/roster-url.js";
import { AUTH_STATE_PATH, parseStringArg, sleep } from "./helpers.js";

type SavedCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
};

type LeagueTeam = { id: string; name: string };
export type RosterDownload = Parameters<
  typeof buildRosterCsvUrlForSeason
>[0] & {
  filePath: string;
  teamName: string;
};

class FantraxSessionError extends Error {}

const validateRosterCsv = (text: string): void => {
  const rows = parse(text, {
    bom: true,
    relax_column_count: true,
    skip_empty_lines: true,
  }) as string[][];
  const sections = new Set<string>();
  let section = "";
  let header: string[] = [];
  for (const row of rows) {
    if (
      row.length === 2 &&
      row[0] === "" &&
      ["Skaters", "Goalies"].includes(row[1])
    ) {
      section = row[1];
      header = [];
    } else if (section && row[0] === "ID") {
      const stats =
        section === "Skaters"
          ? [
              "GP",
              "G",
              "A",
              "Pt",
              "+/-",
              "PIM",
              "SOG",
              "PPP",
              "SHP",
              "Hit",
              "Blk",
            ]
          : [
              "GP",
              "GAA",
              "SV",
              "SV%",
              "SHO",
              "PIM",
              "G",
              "A",
              "Pt",
              "PPP",
              "SHP",
            ];
      if (
        !["Pos", "Player", ...stats].every((key) => row.includes(key)) ||
        (section === "Goalies" && !row.includes("W") && !row.includes("W-G"))
      ) {
        throw new Error(`Incomplete ${section} CSV header`);
      }
      header = row;
      sections.add(section);
    } else if (row[0]?.startsWith("*") && row.length !== header.length) {
      throw new Error(`Incomplete ${section} CSV player row`);
    }
  }
  if (!sections.has("Skaters") || !sections.has("Goalies")) {
    throw new Error(
      "Fantrax did not return a complete roster CSV. The saved session may need login renewal.",
    );
  }
};

export class FantraxRosterHttpClient {
  private readonly cookies: SavedCookie[];

  constructor() {
    const saved = JSON.parse(readFileSync(AUTH_STATE_PATH, "utf8")) as {
      cookies: SavedCookie[];
    };
    if (!Array.isArray(saved.cookies))
      throw new Error(`Invalid saved Fantrax session in ${AUTH_STATE_PATH}`);
    this.cookies = saved.cookies;
  }

  private async request(url: URL): Promise<Response> {
    const cookie = this.cookies
      .filter((c) => {
        const domain = c.domain.replace(/^\./, "");
        const domainMatches =
          url.hostname === domain || url.hostname.endsWith(`.${domain}`);
        const pathMatches =
          url.pathname === c.path ||
          url.pathname.startsWith(c.path.endsWith("/") ? c.path : `${c.path}/`);
        return (
          domainMatches &&
          pathMatches &&
          (c.expires < 0 || c.expires * 1000 > Date.now())
        );
      })
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
    const response = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0", cookie },
      redirect: "error",
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 401 || response.status === 403) {
        throw new FantraxSessionError(
          `Fantrax HTTP ${response.status}: renew the saved session with the login script before retrying.`,
        );
      }
      throw new Error(`Fantrax HTTP ${response.status} from ${url.pathname}`);
    }
    return response;
  }

  async getLeagueTeams(leagueId: string): Promise<LeagueTeam[]> {
    const url = new URL("https://www.fantrax.com/fxea/general/getLeagueInfo");
    url.searchParams.set("leagueId", leagueId);
    const response = await this.request(url);
    const info = (await response.json()) as {
      teamInfo?: Record<string, LeagueTeam>;
    };
    if (!info.teamInfo || typeof info.teamInfo !== "object")
      throw new Error("Fantrax league metadata is missing teamInfo");
    const teams = Object.values(info.teamInfo);
    if (!teams.length || teams.some((t) => !t.id || !t.name))
      throw new Error("Fantrax league metadata has incomplete team IDs/names");
    return teams;
  }

  async download(job: RosterDownload): Promise<void> {
    const partialPath = `${job.filePath}.part`;
    try {
      const response = await this.request(
        new URL(buildRosterCsvUrlForSeason(job)),
      );
      const text = await response.text();
      validateRosterCsv(text);
      writeFileSync(partialPath, text);
      renameSync(partialPath, job.filePath);
    } finally {
      rmSync(partialPath, { force: true });
    }
  }
}

export const parseRosterConcurrency = (argv: string[]): number => {
  const argument = parseStringArg(argv, "--concurrency");
  const value = argument === undefined ? 4 : Number(argument);
  if (!Number.isInteger(value) || value < 1 || value > 8)
    throw new Error("--concurrency must be an integer from 1 to 8");
  return value;
};

export const downloadRosterReports = async (
  client: FantraxRosterHttpClient,
  jobs: readonly RosterDownload[],
  concurrency: number,
  pauseBetweenMs: number,
): Promise<number> => {
  let next = 0;
  let downloaded = 0;
  let failure: Error | undefined;
  const worker = async (): Promise<void> => {
    while (!failure && next < jobs.length) {
      const job = jobs[next++];
      try {
        for (let attempt = 1; ; attempt++) {
          try {
            await client.download(job);
            console.info(`[${job.teamName}] saved ${job.filePath}`);
            downloaded++;
            break;
          } catch (error) {
            if (error instanceof FantraxSessionError) throw error;
            if (attempt === 3)
              throw new Error(
                `[${job.teamName}] CSV download failed after 3 attempts. Completed CSVs remain in the output directory; rerun to resume.`,
                { cause: error },
              );
            console.info(
              `[${job.teamName}] attempt ${attempt}/3 failed: ${String(error)}; retrying attempt ${attempt + 1}/3.`,
            );
            await sleep(2_000 * attempt);
          }
        }
        if (pauseBetweenMs > 0) await sleep(pauseBetweenMs);
      } catch (error) {
        failure ??= error instanceof Error ? error : new Error(String(error));
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, jobs.length) }, worker),
  );
  if (failure) throw failure;
  return downloaded;
};
