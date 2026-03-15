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
import { CAREER_HIGHLIGHT_TYPES, TEAMS } from "../src/config";
import {
  resolveSnapshotGenerationConfig,
  type SnapshotGenerationConfig,
} from "./snapshot-generation";
import {
  getCareerGoaliesData,
  getCareerHighlightsData,
  getCareerPlayersData,
} from "../src/features/career/service";
import {
  getGoaliesStatsCombined,
  getPlayersStatsCombined,
} from "../src/features/stats/service";
import {
  getPlayoffLeaderboardData,
  getRegularLeaderboardData,
  getTransactionLeaderboardData,
} from "../src/features/leaderboard/service";
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
  getSnapshotPrefix,
  getTransactionsLeaderboardSnapshotKey,
  isR2SnapshotConfigAvailable,
  loadSnapshot,
} from "../src/infra/snapshots/store";
import { getLastModifiedFromDb } from "../src/db/queries";
import {
  getR2SnapshotMaxAttempts,
  getR2SnapshotRetryBaseDelayMs,
  retryR2Operation,
  type R2RetryContext,
} from "../src/infra/r2/retry";

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

type UploadProgress = {
  completed: number;
  total: number;
};

const shouldUploadToR2 = (): boolean => process.env.USE_R2_SNAPSHOTS === "true";

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const logR2Retry = ({
  delayMs,
  error,
  maxAttempts,
  nextAttempt,
  operation,
}: R2RetryContext): void => {
  console.warn(
    `⚠️  ${operation} failed: ${getErrorMessage(error)}. ` +
      `Retrying in ${delayMs}ms (${nextAttempt}/${maxAttempts})...`,
  );
};

const logR2UploadSuccess = (
  snapshotKey: string,
  uploadProgress: UploadProgress,
): void => {
  uploadProgress.completed += 1;
  console.info(
    `✅ Uploaded to R2 (${uploadProgress.completed}/${uploadProgress.total}): ` +
      `${getSnapshotObjectKey(snapshotKey)}`,
  );
};

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

  const objectKey = getSnapshotObjectKey(snapshotKey);

  try {
    await retryR2Operation(
      `R2 upload ${objectKey}`,
      () =>
        createSnapshotR2Client().send(
          new PutObjectCommand({
            Bucket: bucketName,
            Key: objectKey,
            Body: body,
            ContentType: "application/json",
            Metadata: {
              "generated-at": generatedAt,
            },
          }),
        ),
      logR2Retry,
    );
  } catch (error) {
    throw new Error(
      `Failed to upload R2 snapshot ${bucketName}/${objectKey}: ${getErrorMessage(error)}`,
    );
  }
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
    return await retryR2Operation(
      `snapshot manifest lookup ${getSnapshotManifestKey()}`,
      () => loadSnapshot<SnapshotManifest>(getSnapshotManifestKey()),
      logR2Retry,
    );
  } catch (error) {
    console.warn(
      "⚠️  Failed to load existing snapshot manifest, continuing without merge: " +
        getErrorMessage(error),
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
  if (shouldUploadToR2()) {
    console.info(
      `   R2 target: ${getSnapshotBucketName()}/${getSnapshotPrefix()}/`,
    );
    console.info(
      "   R2 retry policy: " +
        `${getR2SnapshotMaxAttempts()} attempts, ` +
        `${getR2SnapshotRetryBaseDelayMs()}ms base backoff`,
    );
  }

  const entries = await buildSnapshotEntries(config);
  const existingManifest = config.isFullGeneration
    ? null
    : await loadExistingManifest();
  const uploadProgress: UploadProgress = {
    completed: 0,
    total: entries.length + 1,
  };

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
      logR2UploadSuccess(entry.key, uploadProgress);
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
    logR2UploadSuccess(getSnapshotManifestKey(), uploadProgress);
  }

  console.info(`✅ Snapshot generation complete (${entries.length} payloads)`);
};

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
