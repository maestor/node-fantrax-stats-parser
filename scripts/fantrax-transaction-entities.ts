import fs from "node:fs";
import path from "node:path";
import type { FantraxEntity } from "../src/features/fantrax/entities.js";
import {
  normalizeTransactionEntityName,
  resolveTransactionTeamId,
  type MissingTransactionEntityLookup,
} from "./transaction-import-lib.js";

type Cookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
};
type HistoryRow = {
  txSetId?: string;
  executed?: boolean;
  deleted?: boolean;
  scorer?: { scorerId?: string; name?: string; posShortNames?: string };
  cells?: { key: string; content?: string }[];
};
type HistoryResponse = {
  pageError?: unknown;
  responses?: {
    errors?: unknown[];
    data?: {
      paginatedResultSet?: { totalNumPages: number; pageNumber: number };
      table?: { rows: HistoryRow[] };
    };
  }[];
};
type Identity = { entity: FantraxEntity; teamIds: string[] };

export const createFantraxTransactionEntityLookup = (
  options: { artifactDir?: string } = {},
): MissingTransactionEntityLookup => {
  const artifactDir =
    options.artifactDir ?? path.resolve("src/playwright/.fantrax");
  const histories = new Map<number, Promise<Identity[]>>();

  const loadSeason = async (season: number): Promise<Identity[]> => {
    const mappingPath = path.join(artifactDir, "fantrax-leagues.json");
    const authPath = path.join(artifactDir, "fantrax-auth.json");
    if (!fs.existsSync(mappingPath) || !fs.existsSync(authPath)) {
      throw new Error(
        "Missing Fantrax league mapping or saved session. Sync league IDs and renew the saved login before recovering transaction entities.",
      );
    }
    const mapping = JSON.parse(fs.readFileSync(mappingPath, "utf8")) as {
      seasons: { year: number; leagueId: string }[];
    };
    const leagueId = mapping.seasons.find((s) => s.year === season)?.leagueId;
    if (!leagueId)
      throw new Error(`Missing Fantrax league mapping for season ${season}.`);
    const saved = JSON.parse(fs.readFileSync(authPath, "utf8")) as {
      cookies: Cookie[];
    };
    const url = new URL("https://www.fantrax.com/fxpa/req");
    url.searchParams.set("leagueId", leagueId);
    const cookie = saved.cookies
      .filter((c) => {
        const domain = c.domain.replace(/^\./, "");
        return (
          (url.hostname === domain || url.hostname.endsWith(`.${domain}`)) &&
          (url.pathname === c.path ||
            url.pathname.startsWith(
              c.path.endsWith("/") ? c.path : `${c.path}/`,
            )) &&
          (c.expires < 0 || c.expires * 1000 > Date.now())
        );
      })
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
    const identities: Identity[] = [];
    for (const view of ["CLAIM_DROP", "TRADE"]) {
      const teamsByTransaction = new Map<string, string[]>();
      let totalPages = 1;
      for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            cookie,
            Accept: "application/json",
            "Content-Type": "text/plain",
            "user-agent": "Mozilla/5.0",
          },
          redirect: "error",
          signal: AbortSignal.timeout(45_000),
          body: JSON.stringify({
            msgs: [
              {
                method: "getTransactionDetailsHistory",
                data: {
                  view,
                  team: "ALL",
                  positionOrGroup: "ALL",
                  executedOnly: true,
                  includeDeleted: false,
                  pageNumber,
                  maxResultsPerPage: 200,
                },
              },
            ],
            uiv: 3,
            refUrl: `https://www.fantrax.com/fantasy/league/${leagueId}/transactions/history`,
            dt: 1,
            at: 0,
            tz: "Europe/Helsinki",
          }),
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error(
            `Fantrax HTTP ${response.status}: transaction identity recovery failed; check the saved session/login before retrying.`,
          );
        }
        const payload = (await response.json()) as HistoryResponse;
        const result = payload.responses?.[0];
        const data = result?.data;
        const pagination = data?.paginatedResultSet;
        if (
          payload.pageError ||
          result?.errors?.length ||
          !Array.isArray(data?.table?.rows) ||
          !pagination ||
          !Number.isInteger(pagination.totalNumPages) ||
          pagination.totalNumPages < 0 ||
          pagination.pageNumber !== pageNumber
        ) {
          throw new Error(
            `Fantrax returned incomplete transaction history for ${season}; check the saved session/login before retrying.`,
          );
        }
        totalPages = pagination.totalNumPages;
        for (const row of data.table.rows) {
          // Fantrax emits shared team cells only on the first row of a group.
          // Retain context by transaction ID, including when a group spans pages.
          const teamCells = (row.cells ?? []).filter((c) =>
            ["team", "from", "to"].includes(c.key),
          );
          const teamIds = teamCells.length
            ? teamCells
                .map((c) => resolveTransactionTeamId(c.content ?? ""))
                .filter((id): id is string => id !== null)
            : row.txSetId
              ? (teamsByTransaction.get(row.txSetId) ?? [])
              : [];
          if (row.txSetId && teamCells.length)
            teamsByTransaction.set(row.txSetId, teamIds);
          const scorer = row.scorer;
          const position = scorer?.posShortNames;
          if (
            !row.executed ||
            row.deleted ||
            !scorer?.scorerId ||
            !scorer.name ||
            !["F", "D", "G"].includes(position ?? "")
          )
            continue;
          identities.push({
            entity: {
              fantraxId: scorer.scorerId,
              name: scorer.name,
              position: position as FantraxEntity["position"],
              firstSeenSeason: season,
              lastSeenSeason: season,
            },
            teamIds,
          });
        }
      }
    }
    return identities;
  };

  return async (args) => {
    let history = histories.get(args.season);
    if (!history) {
      history = loadSeason(args.season);
      histories.set(args.season, history);
    }
    const positions = (args.rawPosition ?? "").split(",").map((p) => p.trim());
    const candidates = (await history).filter(
      ({ entity, teamIds }) =>
        normalizeTransactionEntityName(entity.name) ===
          normalizeTransactionEntityName(args.name) &&
        positions.includes(entity.position ?? "") &&
        args.teamIds.some((id) => teamIds.includes(id)),
    );
    const unique = new Map(
      candidates.map((c) => [c.entity.fantraxId, c.entity]),
    );
    // A provider transaction ID is authoritative; a same-name catalog match is not.
    return unique.size === 1
      ? [...unique.values()][0]
      : unique.size > 1
        ? { ambiguous: true }
        : null;
  };
};
