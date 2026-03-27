import { mkdirSync, writeFileSync } from "fs";

import {
  buildOpeningDraftOutputPath,
  DEFAULT_ENTRY_DRAFT_OUT_DIR,
  parseOpeningDraftHtml,
} from "../features/drafts/parser.js";
import { parseStringArg } from "./helpers.js";

type SyncOpeningDraftOptions = {
  url: string;
  outDir: string;
};

const parseSyncOpeningDraftOptions = (
  argv: string[],
): SyncOpeningDraftOptions => {
  const url =
    parseStringArg(argv, "--url") ?? argv.find((arg) => !arg.startsWith("-"));
  if (!url) {
    throw new Error(
      "Missing opening draft thread URL. Use --url=https://ffhl.kld.im/threads/...",
    );
  }

  const parsedUrl = new URL(url);
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error(
      `Unsupported URL protocol for opening-draft sync: ${parsedUrl.protocol}`,
    );
  }

  return {
    url: parsedUrl.toString(),
    outDir: parseStringArg(argv, "--out") ?? DEFAULT_ENTRY_DRAFT_OUT_DIR,
  };
};

const fetchThreadHtml = async (url: string): Promise<string> => {
  const response = await fetch(url, {
    headers: {
      "user-agent": "node-fantrax-stats-parser/opening-draft-sync",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch opening draft thread ${url}: ${response.status} ${response.statusText}`,
    );
  }

  return response.text();
};

const main = async (): Promise<void> => {
  const options = parseSyncOpeningDraftOptions(process.argv.slice(2));

  console.info(`Fetching opening draft thread: ${options.url}`);
  const html = await fetchThreadHtml(options.url);
  const { picks } = parseOpeningDraftHtml(html);
  const filePath = buildOpeningDraftOutputPath({
    outDir: options.outDir,
  });

  mkdirSync(options.outDir, { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(picks, null, 2)}\n`, "utf8");

  console.info(`Saved ${picks.length} opening draft picks to ${filePath}`);
};

void main().catch((error: unknown) => {
  const details = error instanceof Error ? error.message : String(error);
  console.error(details);
  process.exitCode = 1;
});
