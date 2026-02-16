#!/usr/bin/env tsx

// Load environment variables from .env file
import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { TEAMS, CURRENT_SEASON } from "../src/constants";

interface UploadStats {
  uploaded: number;
  skipped: number;
  errors: number;
  filesChecked: number;
}

interface ManifestEntry {
  regular: number[];
  playoffs: number[];
}

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

const calculateMD5 = (content: Buffer): string => {
  return crypto.createHash("md5").update(content).digest("hex");
};

const fileExistsInR2 = async (
  client: S3Client,
  bucket: string,
  key: string
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
  forceUpload: boolean
): Promise<boolean> => {
  const content = fs.readFileSync(localPath);

  if (!forceUpload) {
    const exists = await fileExistsInR2(client, bucket, r2Key);
    if (exists) {
      console.log(`  ⏭️  Skipped (exists): ${r2Key}`);
      return false;
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
    })
  );

  console.log(`  ✅ Uploaded: ${r2Key}`);
  return true;
};

const fetchExistingManifest = async (
  client: S3Client,
  bucket: string
): Promise<Record<string, ManifestEntry> | null> => {
  try {
    const response = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: "manifest.json" })
    );
    const body = await response.Body?.transformToString();
    return body ? JSON.parse(body) : null;
  } catch {
    return null;
  }
};

const mergeManifests = (
  existing: Record<string, ManifestEntry> | null,
  local: Record<string, ManifestEntry>
): Record<string, ManifestEntry> => {
  if (!existing) return local;

  const merged = { ...existing };
  for (const [teamId, localEntry] of Object.entries(local)) {
    if (!merged[teamId]) {
      merged[teamId] = localEntry;
      continue;
    }

    const regularSet = new Set([...merged[teamId].regular, ...localEntry.regular]);
    const playoffsSet = new Set([...merged[teamId].playoffs, ...localEntry.playoffs]);

    merged[teamId] = {
      regular: Array.from(regularSet).sort((a, b) => a - b),
      playoffs: Array.from(playoffsSet).sort((a, b) => a - b),
    };
  }

  return merged;
};

const buildManifest = (csvDir: string): Record<string, ManifestEntry> => {
  const manifest: Record<string, ManifestEntry> = {};

  for (const team of TEAMS) {
    const teamDir = path.join(csvDir, team.id);
    if (!fs.existsSync(teamDir)) continue;

    const files = fs.readdirSync(teamDir);
    const regular: number[] = [];
    const playoffs: number[] = [];

    for (const file of files) {
      const match = file.match(/^(regular|playoffs)-(\d{4})-(\d{4})\.csv$/);
      if (!match) continue;

      const [, reportType, startYear] = match;
      const season = parseInt(startYear, 10);

      if (reportType === "regular") {
        regular.push(season);
      } else if (reportType === "playoffs") {
        playoffs.push(season);
      }
    }

    manifest[team.id] = {
      regular: regular.sort((a, b) => a - b),
      playoffs: playoffs.sort((a, b) => a - b),
    };
  }

  return manifest;
};

const main = async () => {
  const args = process.argv.slice(2);
  const onlyCurrentSeason = args.includes("--current-only");
  const forceAll = args.includes("--force");
  const dryRun = args.includes("--dry-run");

  const csvDir = path.resolve(process.cwd(), "csv");
  const bucketName = getEnvOrThrow("R2_BUCKET_NAME");
  const client = createR2Client();

  console.log("🚀 Starting R2 upload...");
  console.log(`   Mode: ${onlyCurrentSeason ? "Current season only" : "All seasons"}`);
  console.log(`   Force upload: ${forceAll}`);
  console.log(`   Dry run: ${dryRun}`);
  console.log("");

  const stats: UploadStats = {
    uploaded: 0,
    skipped: 0,
    errors: 0,
    filesChecked: 0,
  };

  // Upload CSV files
  for (const team of TEAMS) {
    const teamDir = path.join(csvDir, team.id);
    if (!fs.existsSync(teamDir)) {
      console.log(`⚠️  Team ${team.id} (${team.name}): No CSV directory, skipping`);
      continue;
    }

    console.log(`📂 Team ${team.id} (${team.name}):`);
    const files = fs.readdirSync(teamDir);

    for (const file of files) {
      if (!file.endsWith(".csv")) continue;

      stats.filesChecked++;
      const match = file.match(/^(regular|playoffs)-(\d{4})-(\d{4})\.csv$/);
      if (!match) {
        console.log(`  ⚠️  Invalid filename: ${file}`);
        continue;
      }

      const [, , startYear] = match;
      const season = parseInt(startYear, 10);

      // Skip historical data if only-current-season mode
      if (onlyCurrentSeason && season < CURRENT_SEASON) {
        continue;
      }

      const localPath = path.join(teamDir, file);
      const r2Key = `${team.id}/${file}`;

      try {
        if (dryRun) {
          console.log(`  🔍 Would upload: ${r2Key}`);
          stats.uploaded++;
        } else {
          const uploaded = await uploadFile(
            client,
            bucketName,
            localPath,
            r2Key,
            forceAll || season === CURRENT_SEASON
          );
          if (uploaded) {
            stats.uploaded++;
          } else {
            stats.skipped++;
          }
        }
      } catch (error) {
        console.error(`  ❌ Error uploading ${r2Key}:`, error);
        stats.errors++;
      }
    }
  }

  // Upload manifest
  console.log("");
  console.log("📋 Generating manifest...");

  let manifest: Record<string, ManifestEntry>;
  if (onlyCurrentSeason) {
    // In current-only mode, merge local seasons into existing R2 manifest
    // to preserve historical season entries not present on local disk
    console.log("  📥 Fetching existing manifest from R2 for merge...");
    const existingManifest = await fetchExistingManifest(client, bucketName);
    const localManifest = buildManifest(csvDir);
    manifest = mergeManifests(existingManifest, localManifest);
    if (existingManifest) {
      console.log("  🔀 Merged local seasons into existing manifest");
    } else {
      console.log("  ⚠️  No existing manifest found, using local manifest");
    }
  } else {
    manifest = buildManifest(csvDir);
  }

  const manifestJson = JSON.stringify(manifest, null, 2);

  if (dryRun) {
    console.log("  🔍 Would upload: manifest.json");
  } else {
    await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: "manifest.json",
        Body: manifestJson,
        ContentType: "application/json",
      })
    );
    console.log("  ✅ Uploaded: manifest.json");
  }

  // Upload last-modified timestamp
  const timestampFile = path.join(csvDir, "last-modified.txt");
  if (fs.existsSync(timestampFile)) {
    const timestamp = fs.readFileSync(timestampFile, "utf-8");
    if (dryRun) {
      console.log("  🔍 Would upload: last-modified.txt");
    } else {
      await client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: "last-modified.txt",
          Body: timestamp,
          ContentType: "text/plain",
        })
      );
      console.log("  ✅ Uploaded: last-modified.txt");
    }
  }

  console.log("");
  console.log("📊 Summary:");
  console.log(`   Files checked: ${stats.filesChecked}`);
  console.log(`   Uploaded: ${stats.uploaded}`);
  console.log(`   Skipped: ${stats.skipped}`);
  console.log(`   Errors: ${stats.errors}`);
  console.log("");
  console.log("✨ Done!");
};

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
