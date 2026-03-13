import fs from "fs/promises";
import path from "path";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { CareerHighlightType, Report } from "./types";

const DEFAULT_SNAPSHOT_DIR = path.resolve(
  process.cwd(),
  "generated",
  "snapshots",
);
const DEFAULT_SNAPSHOT_PREFIX = "snapshots";
const DEFAULT_CACHE_TTL_MS = 60_000;

type SnapshotCacheEntry = {
  expiresAt: number;
  value: unknown | null;
};

type SnapshotBody = {
  transformToString?: () => Promise<string>;
};

const snapshotCache = new Map<string, SnapshotCacheEntry>();
const snapshotInflight = new Map<string, Promise<unknown | null>>();

let snapshotR2Client: S3Client | null = null;

const getEnv = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};

const parsePositiveInt = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const normalizeSnapshotKey = (snapshotKey: string): string =>
  snapshotKey.replace(/^\/+/, "").replace(/\.json$/u, "");

const isMissingObjectError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  const maybeStatus = (
    error as Error & { $metadata?: { httpStatusCode?: number } }
  ).$metadata;
  return (
    error.name === "NoSuchKey" ||
    error.name === "NotFound" ||
    error.name === "NotFoundError" ||
    maybeStatus?.httpStatusCode === 404
  );
};

/** @internal Test-only export for snapshot environment assertions. */
export const getSnapshotDir = (): string =>
  getEnv("SNAPSHOT_DIR") ?? DEFAULT_SNAPSHOT_DIR;

export const getSnapshotPrefix = (): string =>
  getEnv("R2_SNAPSHOT_PREFIX") ?? DEFAULT_SNAPSHOT_PREFIX;

export const getSnapshotBucketName = (): string | undefined =>
  getEnv("R2_SNAPSHOT_BUCKET_NAME") ?? getEnv("R2_BUCKET_NAME");

export const isR2SnapshotConfigAvailable = (): boolean =>
  Boolean(
    getSnapshotBucketName() &&
    getEnv("R2_ENDPOINT") &&
    getEnv("R2_ACCESS_KEY_ID") &&
    getEnv("R2_SECRET_ACCESS_KEY"),
  );

/** @internal Test-only export for snapshot environment assertions. */
export const getSnapshotCacheTtlMs = (): number =>
  parsePositiveInt(getEnv("SNAPSHOT_CACHE_TTL_MS")) ?? DEFAULT_CACHE_TTL_MS;

export const getSnapshotFilePath = (snapshotKey: string): string =>
  path.resolve(getSnapshotDir(), `${normalizeSnapshotKey(snapshotKey)}.json`);

export const getSnapshotObjectKey = (snapshotKey: string): string =>
  `${getSnapshotPrefix()}/${normalizeSnapshotKey(snapshotKey)}.json`;

export const createSnapshotR2Client = (): S3Client => {
  if (snapshotR2Client) return snapshotR2Client;

  const endpoint = getEnv("R2_ENDPOINT");
  const accessKeyId = getEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = getEnv("R2_SECRET_ACCESS_KEY");

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("Missing R2 snapshot configuration");
  }

  snapshotR2Client = new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return snapshotR2Client;
};

const readLocalSnapshot = async (
  snapshotKey: string,
): Promise<string | null> => {
  try {
    return await fs.readFile(getSnapshotFilePath(snapshotKey), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
};

const readR2Snapshot = async (snapshotKey: string): Promise<string | null> => {
  const bucketName = getSnapshotBucketName();
  if (!bucketName || !isR2SnapshotConfigAvailable()) return null;

  try {
    const response = await createSnapshotR2Client().send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: getSnapshotObjectKey(snapshotKey),
      }),
    );
    const body = response.Body as SnapshotBody | undefined;
    return body?.transformToString ? body.transformToString() : null;
  } catch (error) {
    if (isMissingObjectError(error)) {
      return null;
    }
    throw error;
  }
};

export const loadSnapshot = async <T>(
  snapshotKey: string,
): Promise<T | null> => {
  const normalizedKey = normalizeSnapshotKey(snapshotKey);
  const cached = snapshotCache.get(normalizedKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as T | null;
  }

  const inflight = snapshotInflight.get(normalizedKey);
  if (inflight) {
    return inflight as Promise<T | null>;
  }

  const loadPromise = (async () => {
    const raw =
      (await readLocalSnapshot(normalizedKey)) ??
      (await readR2Snapshot(normalizedKey));
    const value = raw === null ? null : (JSON.parse(raw) as T);
    snapshotCache.set(normalizedKey, {
      value,
      expiresAt: Date.now() + getSnapshotCacheTtlMs(),
    });
    return value;
  })();

  snapshotInflight.set(normalizedKey, loadPromise);

  try {
    return (await loadPromise) as T | null;
  } finally {
    snapshotInflight.delete(normalizedKey);
  }
};

export const getCareerPlayersSnapshotKey = (): string => "career/players";

export const getCareerGoaliesSnapshotKey = (): string => "career/goalies";

export const getCareerHighlightsSnapshotKey = (
  type: CareerHighlightType,
): string => `career/highlights/${type}`;

export const getRegularLeaderboardSnapshotKey = (): string =>
  "leaderboard/regular";

export const getPlayoffsLeaderboardSnapshotKey = (): string =>
  "leaderboard/playoffs";

export const getTransactionsLeaderboardSnapshotKey = (): string =>
  "leaderboard/transactions";

export const getCombinedSnapshotKey = (
  kind: "players" | "goalies",
  report: Report,
  teamId: string,
): string => `${kind}/combined/${report}/team-${teamId}`;

export const getSnapshotManifestKey = (): string => "manifest";

/** @internal Test-only export for clearing snapshot caches between tests. */
export const resetSnapshotCacheForTests = (): void => {
  snapshotCache.clear();
  snapshotInflight.clear();
  snapshotR2Client = null;
};
