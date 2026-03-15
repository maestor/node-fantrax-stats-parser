#!/usr/bin/env tsx

import dotenv from "dotenv";
dotenv.config();

import crypto from "crypto";
import fs from "fs";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { CURRENT_SEASON } from "../src/config";
import {
  DEFAULT_TRANSACTIONS_OUT_DIR,
  parseTransactionCsvFileName,
} from "../src/features/transactions/files";

type UploadOptions = {
  currentOnly: boolean;
  dryRun: boolean;
  force: boolean;
  seasonFilter: number | null;
};

type UploadStats = {
  checked: number;
  errors: number;
  invalidName: number;
  skipped: number;
  skippedByFilter: number;
  uploaded: number;
};

const TRANSACTIONS_PREFIX = "transactions";

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

const parseArgs = (args: string[]): UploadOptions => {
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

const calculateMD5 = (content: Buffer): string =>
  crypto.createHash("md5").update(content).digest("hex");

const fileExistsInR2 = async (
  client: S3Client,
  bucket: string,
  key: string,
): Promise<boolean> => {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
};

const uploadFile = async (
  client: S3Client,
  bucket: string,
  localPath: string,
  r2Key: string,
  forceUpload: boolean,
): Promise<"uploaded" | "skipped"> => {
  const content = fs.readFileSync(localPath);

  if (!forceUpload) {
    const exists = await fileExistsInR2(client, bucket, r2Key);
    if (exists) {
      console.info(`  Skipped existing object: ${r2Key}`);
      return "skipped";
    }
  }

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: r2Key,
      Body: content,
      ContentType: "text/csv",
      Metadata: {
        "upload-date": new Date().toISOString(),
        "md5-hash": calculateMD5(content),
      },
    }),
  );

  console.info(`  Uploaded: ${r2Key}`);
  return "uploaded";
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const sourceDir = DEFAULT_TRANSACTIONS_OUT_DIR;

  console.info("Starting transaction CSV upload to R2...");
  console.info(`   Source: ${sourceDir}`);
  console.info(
    `   Mode: ${
      options.seasonFilter !== null
        ? `season ${options.seasonFilter}-${options.seasonFilter + 1}`
        : options.currentOnly
          ? "current season only"
          : "all seasons"
    }`,
  );
  console.info(`   Force upload: ${options.force}`);
  console.info(`   Dry run: ${options.dryRun}`);
  console.info("");

  if (!fs.existsSync(sourceDir)) {
    console.info(`No transactions directory found: ${sourceDir}`);
    return;
  }

  const files = fs.readdirSync(sourceDir).filter((file) => file.endsWith(".csv"));
  if (!files.length) {
    console.info(`No transaction CSV files found in ${sourceDir}`);
    return;
  }

  const bucketName = getEnvOrThrow("R2_BUCKET_NAME");
  const client = createR2Client();
  const stats: UploadStats = {
    checked: 0,
    errors: 0,
    invalidName: 0,
    skipped: 0,
    skippedByFilter: 0,
    uploaded: 0,
  };

  for (const fileName of files) {
    stats.checked++;
    const parsed = parseTransactionCsvFileName(fileName);
    if (!parsed) {
      stats.invalidName++;
      console.error(`  Invalid transaction CSV filename, skipping: ${fileName}`);
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

    const localPath = `${sourceDir}/${fileName}`;
    const r2Key = `${TRANSACTIONS_PREFIX}/${fileName}`;

    try {
      if (options.dryRun) {
        console.info(`  Would upload: ${localPath} -> ${r2Key}`);
        stats.uploaded++;
        continue;
      }

      const result = await uploadFile(
        client,
        bucketName,
        localPath,
        r2Key,
        options.force || parsed.seasonStartYear === CURRENT_SEASON,
      );
      if (result === "uploaded") {
        stats.uploaded++;
      } else {
        stats.skipped++;
      }
    } catch (error) {
      stats.errors++;
      console.error(
        `  Error uploading ${fileName}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  console.info("");
  console.info("Summary:");
  console.info(`   Files checked: ${stats.checked}`);
  console.info(`   Uploaded: ${stats.uploaded}`);
  console.info(`   Skipped existing: ${stats.skipped}`);
  console.info(`   Skipped by filter: ${stats.skippedByFilter}`);
  console.info(`   Invalid filenames: ${stats.invalidName}`);
  console.info(`   Errors: ${stats.errors}`);
};

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
