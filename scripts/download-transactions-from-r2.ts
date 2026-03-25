#!/usr/bin/env tsx

import dotenv from "dotenv";
dotenv.config();

import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";
import { Readable } from "stream";

import { CURRENT_SEASON } from "../src/config/index.js";
import {
  DEFAULT_TRANSACTIONS_OUT_DIR,
  parseTransactionCsvFileName,
} from "../src/features/transactions/files.js";

type DownloadOptions = {
  currentOnly: boolean;
  dryRun: boolean;
  force: boolean;
  seasonFilter: number | null;
};

type DownloadStats = {
  downloaded: number;
  errors: number;
  found: number;
  skippedByFilter: number;
  skippedExisting: number;
};

const TRANSACTIONS_PREFIX = "transactions/";

const parseSeasonArg = (args: string[]): number | null => {
  const seasonArg = args.find((arg) => arg.startsWith("--season="));
  if (!seasonArg) {
    return null;
  }

  const value = Number(seasonArg.split("=")[1]);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid --season value: ${seasonArg.split("=")[1]}`);
  }

  return value;
};

const parseArgs = (args: string[]): DownloadOptions => {
  const currentOnly = args.includes("--current-only");
  const seasonFilter = parseSeasonArg(args);
  if (currentOnly && seasonFilter !== null) {
    throw new Error("Use either --current-only or --season, not both.");
  }

  return {
    currentOnly,
    dryRun: args.includes("--dry-run"),
    force: args.includes("--force"),
    seasonFilter,
  };
};

const getEnvOrThrow = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
};

const createR2Client = (): S3Client =>
  new S3Client({
    region: "auto",
    endpoint: getEnvOrThrow("R2_ENDPOINT"),
    credentials: {
      accessKeyId: getEnvOrThrow("R2_ACCESS_KEY_ID"),
      secretAccessKey: getEnvOrThrow("R2_SECRET_ACCESS_KEY"),
    },
  });

const streamToBuffer = async (stream: Readable): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });

const listTransactionKeys = async (
  client: S3Client,
  bucket: string,
): Promise<string[]> => {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: TRANSACTIONS_PREFIX,
        ContinuationToken: continuationToken,
      }),
    );

    for (const object of response.Contents ?? []) {
      if (!object.Key || object.Key.endsWith("/")) {
        continue;
      }
      keys.push(object.Key);
    }

    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return keys;
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const bucketName = getEnvOrThrow("R2_BUCKET_NAME");
  const client = createR2Client();
  const targetDir = DEFAULT_TRANSACTIONS_OUT_DIR;

  console.info("Downloading transaction CSV files from R2...");
  console.info(`   Prefix: ${TRANSACTIONS_PREFIX}`);
  console.info(`   Target: ${targetDir}`);
  console.info(
    `   Mode: ${
      options.seasonFilter !== null
        ? `season ${options.seasonFilter}-${options.seasonFilter + 1}`
        : options.currentOnly
          ? "current season only"
          : "all seasons"
    }`,
  );
  console.info(`   Force overwrite: ${options.force}`);
  console.info(`   Dry run: ${options.dryRun}`);
  console.info("");

  fs.mkdirSync(targetDir, { recursive: true });

  const keys = await listTransactionKeys(client, bucketName);
  if (!keys.length) {
    console.info(`No files found under ${TRANSACTIONS_PREFIX}`);
    return;
  }

  const stats: DownloadStats = {
    downloaded: 0,
    errors: 0,
    found: keys.length,
    skippedByFilter: 0,
    skippedExisting: 0,
  };

  for (const key of keys) {
    const fileName = path.basename(key);
    const parsed = parseTransactionCsvFileName(fileName);
    if (!parsed) {
      continue;
    }

    if (
      options.seasonFilter !== null &&
      parsed.seasonStartYear !== options.seasonFilter
    ) {
      stats.skippedByFilter++;
      continue;
    }

    if (options.currentOnly && parsed.seasonStartYear !== CURRENT_SEASON) {
      stats.skippedByFilter++;
      continue;
    }

    const localPath = path.join(targetDir, fileName);
    const exists = fs.existsSync(localPath);
    if (exists && !options.force) {
      stats.skippedExisting++;
      console.info(`  Skipped existing file: ${fileName}`);
      continue;
    }

    if (options.dryRun) {
      console.info(`  Would download: ${key} -> ${localPath}`);
      stats.downloaded++;
      continue;
    }

    try {
      const response = await client.send(
        new GetObjectCommand({
          Bucket: bucketName,
          Key: key,
        }),
      );

      if (!response.Body) {
        stats.errors++;
        console.error(`  Empty response body for: ${key}`);
        continue;
      }

      const body = await streamToBuffer(response.Body as Readable);
      fs.writeFileSync(localPath, body);
      console.info(`  Saved: ${localPath}`);
      stats.downloaded++;
    } catch (error) {
      stats.errors++;
      console.error(
        `  Error downloading ${key}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  console.info("");
  console.info("Summary:");
  console.info(`   Found in R2: ${stats.found}`);
  console.info(`   Downloaded: ${stats.downloaded}`);
  console.info(`   Skipped existing: ${stats.skippedExisting}`);
  console.info(`   Skipped by filter: ${stats.skippedByFilter}`);
  console.info(`   Errors: ${stats.errors}`);
};

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
