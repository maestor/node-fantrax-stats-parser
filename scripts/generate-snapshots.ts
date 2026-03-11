#!/usr/bin/env tsx

import dotenv from "dotenv";
dotenv.config();

if (process.env.USE_REMOTE_DB !== "true") {
  process.env.TURSO_DATABASE_URL = "file:local.db";
  delete process.env.TURSO_AUTH_TOKEN;
}

import fs from "fs";
import path from "path";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { CAREER_HIGHLIGHT_TYPES, TEAMS } from "../src/constants";
import {
  getCareerGoaliesData,
  getCareerHighlightsData,
  getCareerPlayersData,
  getGoaliesStatsCombined,
  getPlayoffLeaderboardData,
  getPlayersStatsCombined,
  getRegularLeaderboardData,
} from "../src/services";
import {
  createSnapshotR2Client,
  getCareerGoaliesSnapshotKey,
  getCareerHighlightsSnapshotKey,
  getCareerPlayersSnapshotKey,
  getCombinedSnapshotKey,
  getPlayoffsLeaderboardSnapshotKey,
  getRegularLeaderboardSnapshotKey,
  getSnapshotBucketName,
  getSnapshotFilePath,
  getSnapshotManifestKey,
  getSnapshotObjectKey,
  isR2SnapshotConfigAvailable,
} from "../src/snapshots";
import { getLastModifiedFromDb } from "../src/db/queries";

type SnapshotReport = "regular" | "playoffs" | "both";

type SnapshotEntry = {
  bytes: number;
  data: unknown;
  key: string;
};

type SnapshotManifest = {
  generatedAt: string;
  lastModified: string | null;
  schemaVersion: number;
  snapshots: Array<{
    bytes: number;
    key: string;
  }>;
};

const SNAPSHOT_REPORTS: readonly SnapshotReport[] = [
  "regular",
  "playoffs",
  "both",
];

const shouldUploadToR2 = (): boolean => process.env.USE_R2_SNAPSHOTS === "true";

const writeSnapshotFile = (snapshotKey: string, body: string): number => {
  const filePath = getSnapshotFilePath(snapshotKey);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, body);
  return Buffer.byteLength(body);
};

const uploadSnapshotFile = async (
  snapshotKey: string,
  body: string,
  generatedAt: string,
): Promise<void> => {
  const bucketName = getSnapshotBucketName();
  if (!bucketName) {
    throw new Error("Missing snapshot bucket configuration");
  }

  await createSnapshotR2Client().send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: getSnapshotObjectKey(snapshotKey),
      Body: body,
      ContentType: "application/json",
      Metadata: {
        "generated-at": generatedAt,
      },
    }),
  );
};

const buildSnapshotEntries = async (): Promise<SnapshotEntry[]> => {
  const entries: SnapshotEntry[] = [];

  entries.push({
    key: getCareerPlayersSnapshotKey(),
    data: await getCareerPlayersData(),
    bytes: 0,
  });
  entries.push({
    key: getCareerGoaliesSnapshotKey(),
    data: await getCareerGoaliesData(),
    bytes: 0,
  });
  for (const type of CAREER_HIGHLIGHT_TYPES) {
    entries.push({
      key: getCareerHighlightsSnapshotKey(type),
      data: await getCareerHighlightsData(type),
      bytes: 0,
    });
  }
  entries.push({
    key: getRegularLeaderboardSnapshotKey(),
    data: await getRegularLeaderboardData(),
    bytes: 0,
  });
  entries.push({
    key: getPlayoffsLeaderboardSnapshotKey(),
    data: await getPlayoffLeaderboardData(),
    bytes: 0,
  });

  for (const team of TEAMS) {
    for (const report of SNAPSHOT_REPORTS) {
      entries.push({
        key: getCombinedSnapshotKey("players", report, team.id),
        data: await getPlayersStatsCombined(report, team.id),
        bytes: 0,
      });
      entries.push({
        key: getCombinedSnapshotKey("goalies", report, team.id),
        data: await getGoaliesStatsCombined(report, team.id),
        bytes: 0,
      });
    }
  }

  return entries;
};

const main = async () => {
  const generatedAt = new Date().toISOString();
  const lastModified = await getLastModifiedFromDb();

  console.info("📸 Generating API snapshots...");
  console.info(`   Target DB: ${process.env.TURSO_DATABASE_URL}`);
  console.info(`   Upload to R2: ${shouldUploadToR2()}`);

  const entries = await buildSnapshotEntries();

  for (const entry of entries) {
    const body = JSON.stringify(entry.data);
    entry.bytes = writeSnapshotFile(entry.key, body);

    if (shouldUploadToR2()) {
      if (!isR2SnapshotConfigAvailable()) {
        throw new Error(
          "USE_R2_SNAPSHOTS=true requires R2 snapshot environment variables",
        );
      }
      await uploadSnapshotFile(entry.key, body, generatedAt);
    }
  }

  const manifest: SnapshotManifest = {
    schemaVersion: 1,
    generatedAt,
    lastModified,
    snapshots: entries.map((entry) => ({
      key: entry.key,
      bytes: entry.bytes,
    })),
  };

  const manifestBody = JSON.stringify(manifest, null, 2);
  writeSnapshotFile(getSnapshotManifestKey(), manifestBody);

  if (shouldUploadToR2()) {
    await uploadSnapshotFile(
      getSnapshotManifestKey(),
      manifestBody,
      generatedAt,
    );
  }

  console.info(`✅ Snapshot generation complete (${entries.length} payloads)`);
};

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
