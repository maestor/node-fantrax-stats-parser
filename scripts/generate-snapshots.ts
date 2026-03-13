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
  resolveSnapshotGenerationConfig,
  type SnapshotGenerationConfig,
} from "./snapshot-generation";
import {
  getCareerGoaliesData,
  getCareerHighlightsData,
  getCareerPlayersData,
  getGoaliesStatsCombined,
  getPlayoffLeaderboardData,
  getPlayersStatsCombined,
  getRegularLeaderboardData,
  getTransactionLeaderboardData,
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
  getTransactionsLeaderboardSnapshotKey,
  isR2SnapshotConfigAvailable,
  loadSnapshot,
} from "../src/snapshots";
import { getLastModifiedFromDb } from "../src/db/queries";

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

const buildSnapshotEntries = async (
  config: SnapshotGenerationConfig,
): Promise<SnapshotEntry[]> => {
  const entries: SnapshotEntry[] = [];

  if (config.scopes.includes("career")) {
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
  }

  if (config.scopes.includes("career-highlights")) {
    for (const type of CAREER_HIGHLIGHT_TYPES) {
      entries.push({
        key: getCareerHighlightsSnapshotKey(type),
        data: await getCareerHighlightsData(type),
        bytes: 0,
      });
    }
  }

  if (config.scopes.includes("leaderboard-regular")) {
    entries.push({
      key: getRegularLeaderboardSnapshotKey(),
      data: await getRegularLeaderboardData(),
      bytes: 0,
    });
  }

  if (config.scopes.includes("leaderboard-playoffs")) {
    entries.push({
      key: getPlayoffsLeaderboardSnapshotKey(),
      data: await getPlayoffLeaderboardData(),
      bytes: 0,
    });
  }

  if (config.scopes.includes("transactions")) {
    entries.push({
      key: getTransactionsLeaderboardSnapshotKey(),
      data: await getTransactionLeaderboardData(),
      bytes: 0,
    });
  }

  if (config.scopes.includes("stats")) {
    for (const team of TEAMS) {
      for (const reportType of config.statsReportTypes) {
        entries.push({
          key: getCombinedSnapshotKey("players", reportType, team.id),
          data: await getPlayersStatsCombined(reportType, team.id),
          bytes: 0,
        });
        entries.push({
          key: getCombinedSnapshotKey("goalies", reportType, team.id),
          data: await getGoaliesStatsCombined(reportType, team.id),
          bytes: 0,
        });
      }
    }
  }

  return entries;
};

const loadExistingManifest = async (): Promise<SnapshotManifest | null> => {
  try {
    return await loadSnapshot<SnapshotManifest>(getSnapshotManifestKey());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `⚠️  Failed to load existing snapshot manifest, continuing without merge: ${message}`,
    );
    return null;
  }
};

const buildSnapshotManifest = (
  config: SnapshotGenerationConfig,
  generatedAt: string,
  lastModified: string | null,
  entries: readonly SnapshotEntry[],
  existingManifest: SnapshotManifest | null,
): SnapshotManifest => {
  const mergedSnapshots = new Map<string, { bytes: number; key: string }>();

  if (!config.isFullGeneration) {
    for (const snapshot of existingManifest?.snapshots ?? []) {
      mergedSnapshots.set(snapshot.key, snapshot);
    }
  }

  for (const entry of entries) {
    mergedSnapshots.set(entry.key, {
      key: entry.key,
      bytes: entry.bytes,
    });
  }

  return {
    schemaVersion: 1,
    generatedAt,
    lastModified,
    snapshots: [...mergedSnapshots.values()].sort((a, b) =>
      a.key.localeCompare(b.key),
    ),
  };
};

const main = async () => {
  const config = resolveSnapshotGenerationConfig(process.argv.slice(2));
  const generatedAt = new Date().toISOString();
  const lastModified = await getLastModifiedFromDb();

  console.info("📸 Generating API snapshots...");
  console.info(`   Target DB: ${process.env.TURSO_DATABASE_URL}`);
  console.info(`   Upload to R2: ${shouldUploadToR2()}`);
  console.info(`   Scopes: ${config.scopes.join(", ")}`);
  if (config.scopes.includes("stats")) {
    console.info(`   Stats reports: ${config.statsReportTypes.join(", ")}`);
  }

  const entries = await buildSnapshotEntries(config);
  const existingManifest = config.isFullGeneration
    ? null
    : await loadExistingManifest();

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

  const manifest = buildSnapshotManifest(
    config,
    generatedAt,
    lastModified,
    entries,
    existingManifest,
  );
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
