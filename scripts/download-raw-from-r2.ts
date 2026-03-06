#!/usr/bin/env tsx

import dotenv from "dotenv";
dotenv.config();

import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";
import { Readable } from "stream";

const RAW_PREFIX = "rawFiles/";

interface DownloadOptions {
  dryRun: boolean;
  force: boolean;
}

interface DownloadStats {
  found: number;
  downloaded: number;
  skippedExisting: number;
  errors: number;
}

const parseArgs = (args: string[]): DownloadOptions => {
  return {
    dryRun: args.includes("--dry-run"),
    force: args.includes("--force"),
  };
};

const getEnvOrThrow = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
};

const createR2Client = (): S3Client => {
  return new S3Client({
    region: "auto",
    endpoint: getEnvOrThrow("R2_ENDPOINT"),
    credentials: {
      accessKeyId: getEnvOrThrow("R2_ACCESS_KEY_ID"),
      secretAccessKey: getEnvOrThrow("R2_SECRET_ACCESS_KEY"),
    },
  });
};

const streamToBuffer = async (stream: Readable): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
};

const listAllRawKeys = async (
  client: S3Client,
  bucket: string,
): Promise<string[]> => {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: RAW_PREFIX,
        ContinuationToken: continuationToken,
      }),
    );

    for (const object of response.Contents ?? []) {
      if (!object.Key) continue;
      if (object.Key.endsWith("/")) continue;
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
  const targetDir = path.resolve(process.cwd(), "csv", "temp");

  console.info("📥 Downloading raw CSV files from R2...");
  console.info(`   Prefix: ${RAW_PREFIX}`);
  console.info(`   Target: ${targetDir}`);
  console.info(`   Force overwrite: ${options.force}`);
  console.info(`   Dry run: ${options.dryRun}`);
  console.info("");

  fs.mkdirSync(targetDir, { recursive: true });

  const keys = await listAllRawKeys(client, bucketName);
  if (!keys.length) {
    console.info(`No files found under ${RAW_PREFIX}`);
    return;
  }

  const stats: DownloadStats = {
    found: keys.length,
    downloaded: 0,
    skippedExisting: 0,
    errors: 0,
  };

  for (const key of keys) {
    const fileName = path.basename(key);
    const localPath = path.join(targetDir, fileName);
    const exists = fs.existsSync(localPath);

    if (exists && !options.force) {
      stats.skippedExisting++;
      console.info(`  ⏭️  Skipped (exists): ${fileName}`);
      continue;
    }

    if (options.dryRun) {
      console.info(`  🔍 Would download: ${key} -> ${localPath}`);
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
        console.error(`  ❌ Empty response body for: ${key}`);
        continue;
      }

      const body = await streamToBuffer(response.Body as Readable);
      fs.writeFileSync(localPath, body);
      console.info(`  ✅ Saved: ${localPath}`);
      stats.downloaded++;
    } catch (error) {
      stats.errors++;
      console.error(
        `  ❌ Error downloading ${key}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  console.info("");
  console.info("📊 Summary:");
  console.info(`   Found in R2: ${stats.found}`);
  console.info(`   Downloaded: ${stats.downloaded}`);
  console.info(`   Skipped existing: ${stats.skippedExisting}`);
  console.info(`   Errors: ${stats.errors}`);
  console.info("");
  console.info("✨ Done!");
};

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
