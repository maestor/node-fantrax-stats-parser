#!/usr/bin/env tsx

/**
 * Download CSV files from Cloudflare R2 to local csv/ directory for development
 *
 * Usage:
 *   npm run r2:download                # Download new files (skips existing)
 *   npm run r2:download -- --force     # Overwrite existing files
 *   npm run r2:download -- --team=1    # Download only team 1
 *   npm run r2:download -- --dry-run   # Preview what would be downloaded
 */

// Load environment variables from .env file
import dotenv from "dotenv";
dotenv.config();

import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";
import { Readable } from "stream";

interface DownloadOptions {
  teamId?: string;
  dryRun?: boolean;
  force?: boolean;
}

const parseArgs = (): DownloadOptions => {
  const args = process.argv.slice(2);
  const options: DownloadOptions = {};

  for (const arg of args) {
    if (arg.startsWith("--team=")) {
      options.teamId = arg.split("=")[1];
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--force") {
      options.force = true;
    }
  }

  return options;
};

const getR2Config = () => {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME;

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName) {
    console.error("❌ Missing R2 environment variables:");
    console.error("   R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME");
    console.error("\nSet these in your .env file or environment.");
    process.exit(1);
  }

  return { endpoint, accessKeyId, secretAccessKey, bucketName };
};

const streamToBuffer = async (stream: Readable): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
};

const downloadFiles = async (options: DownloadOptions) => {
  const config = getR2Config();
  const client = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  console.log(`\n📥 Downloading CSV files from R2...`);
  if (options.dryRun) {
    console.log("🔍 DRY RUN MODE - No files will be written\n");
  }
  if (options.force) {
    console.log("⚠️  FORCE MODE - Will overwrite existing files\n");
  }

  // List all objects in bucket
  const prefix = options.teamId ? `${options.teamId}/` : "";
  const listCommand = new ListObjectsV2Command({
    Bucket: config.bucketName,
    Prefix: prefix,
  });

  const listResponse = await client.send(listCommand);
  const objects = listResponse.Contents || [];

  if (objects.length === 0) {
    console.log("⚠️  No files found in R2 bucket");
    return;
  }

  console.log(`Found ${objects.length} files\n`);

  let downloaded = 0;
  let skipped = 0;

  for (const obj of objects) {
    if (!obj.Key) continue;

    // Skip manifest.json and last-modified.txt
    if (obj.Key === "manifest.json" || obj.Key === "last-modified.txt") {
      continue;
    }

    const localPath = path.join(process.cwd(), "csv", obj.Key);
    const localDir = path.dirname(localPath);

    console.log(`  ${obj.Key} (${((obj.Size || 0) / 1024).toFixed(1)} KB)`);

    // Check if file exists locally
    const fileExists = fs.existsSync(localPath);

    if (options.dryRun) {
      if (fileExists && !options.force) {
        console.log(`    → Would skip (already exists): ${localPath}`);
      } else {
        console.log(`    → Would save to: ${localPath}`);
      }
      downloaded++;
      continue;
    }

    // Skip existing files unless --force
    if (fileExists && !options.force) {
      console.log(`    ⏭️  Skipped (already exists, use --force to overwrite)`);
      skipped++;
      continue;
    }

    try {
      // Download file
      const getCommand = new GetObjectCommand({
        Bucket: config.bucketName,
        Key: obj.Key,
      });

      const response = await client.send(getCommand);
      if (!response.Body) {
        console.log(`    ⚠️  Empty response body`);
        skipped++;
        continue;
      }

      const buffer = await streamToBuffer(response.Body as Readable);

      // Ensure directory exists
      fs.mkdirSync(localDir, { recursive: true });

      // Write file
      fs.writeFileSync(localPath, buffer);
      const action = fileExists ? "Overwritten" : "Downloaded";
      console.log(`    ✓ ${action}: ${localPath}`);
      downloaded++;
    } catch (error) {
      console.error(`    ❌ Failed: ${error instanceof Error ? error.message : String(error)}`);
      skipped++;
    }
  }

  console.log(`\n${options.dryRun ? "Would download" : "Downloaded"} ${downloaded} files`);
  if (skipped > 0) {
    console.log(`Skipped ${skipped} files`);
  }
  console.log("\n✅ Done!\n");
};

// Main
const main = async () => {
  try {
    const options = parseArgs();
    await downloadFiles(options);
  } catch (error) {
    console.error("\n❌ Error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
};

main();
