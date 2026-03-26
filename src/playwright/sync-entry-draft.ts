import { mkdirSync, writeFileSync } from "fs";

import {
  buildEntryDraftOutputPath,
  DEFAULT_ENTRY_DRAFT_OUT_DIR,
  parseEntryDraftHtml,
} from "../features/drafts/parser.js";
import { parseStringArg } from "./helpers.js";

type SyncEntryDraftOptions = {
  url: string;
  outDir: string;
};

const parseSyncEntryDraftOptions = (argv: string[]): SyncEntryDraftOptions => {
  const url =
    parseStringArg(argv, "--url") ?? argv.find((arg) => !arg.startsWith("-"));
  if (!url) {
    throw new Error(
      "Missing draft thread URL. Use --url=https://ffhl.kld.im/threads/...",
    );
  }

  const parsedUrl = new URL(url);
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error(`Unsupported URL protocol for draft sync: ${parsedUrl.protocol}`);
  }

  return {
    url: parsedUrl.toString(),
    outDir: parseStringArg(argv, "--out") ?? DEFAULT_ENTRY_DRAFT_OUT_DIR,
  };
};

const fetchThreadHtml = async (url: string): Promise<string> => {
  const response = await fetch(url, {
    headers: {
      "user-agent": "node-fantrax-stats-parser/entry-draft-sync",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch draft thread ${url}: ${response.status} ${response.statusText}`,
    );
  }

  return response.text();
};

const main = async (): Promise<void> => {
  const options = parseSyncEntryDraftOptions(process.argv.slice(2));

  console.info(`Fetching entry draft thread: ${options.url}`);
  const html = await fetchThreadHtml(options.url);
  const { season, picks } = parseEntryDraftHtml(html);
  const filePath = buildEntryDraftOutputPath({
    outDir: options.outDir,
    season,
  });

  mkdirSync(options.outDir, { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(picks, null, 2)}\n`, "utf8");

  console.info(`Saved ${picks.length} draft picks for ${season} to ${filePath}`);
};

void main().catch((error: unknown) => {
  const details = error instanceof Error ? error.message : String(error);
  console.error(details);
  process.exitCode = 1;
});
