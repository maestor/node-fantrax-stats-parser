import path from "path";
import fs from "fs/promises";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  createSnapshotR2Client,
  getCareerGoaliesSnapshotKey,
  getCareerHighlightsSnapshotKey,
  getCareerPlayersSnapshotKey,
  getCombinedSnapshotKey,
  getPlayoffsLeaderboardSnapshotKey,
  getRegularLeaderboardSnapshotKey,
  getSnapshotBucketName,
  getSnapshotCacheTtlMs,
  getSnapshotDir,
  getSnapshotFilePath,
  getSnapshotManifestKey,
  getSnapshotObjectKey,
  getSnapshotPrefix,
  getTransactionsLeaderboardSnapshotKey,
  isR2SnapshotConfigAvailable,
  loadSnapshot,
  resetSnapshotCacheForTests,
} from "../infra/snapshots/store";

const mockSend = jest.fn();

jest.mock("fs/promises", () => ({
  __esModule: true,
  default: {
    readFile: jest.fn(),
  },
}));

jest.mock("@aws-sdk/client-s3", () => ({
  GetObjectCommand: jest.fn().mockImplementation((input: unknown) => input),
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
}));

const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
const mockS3Client = S3Client as unknown as jest.Mock;
const mockGetObjectCommand = GetObjectCommand as unknown as jest.Mock;

const originalEnv = process.env;

const applyR2Env = (): void => {
  process.env.R2_ENDPOINT = "https://example.r2.cloudflarestorage.com";
  process.env.R2_ACCESS_KEY_ID = "access-key";
  process.env.R2_SECRET_ACCESS_KEY = "secret-key";
  process.env.R2_BUCKET_NAME = "csv-bucket";
};

describe("snapshots", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    resetSnapshotCacheForTests();
    process.env = { ...originalEnv };
    delete process.env.SNAPSHOT_DIR;
    delete process.env.R2_SNAPSHOT_PREFIX;
    delete process.env.R2_SNAPSHOT_BUCKET_NAME;
    delete process.env.R2_BUCKET_NAME;
    delete process.env.R2_ENDPOINT;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    delete process.env.SNAPSHOT_CACHE_TTL_MS;
    mockReadFile.mockReset();
    mockSend.mockReset();
    mockS3Client.mockReset().mockImplementation(() => ({ send: mockSend }));
    mockGetObjectCommand
      .mockReset()
      .mockImplementation((input: unknown) => input);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("returns default helper values and normalized snapshot keys", () => {
    expect(getSnapshotDir()).toBe(
      path.resolve(process.cwd(), "generated", "snapshots"),
    );
    expect(getSnapshotPrefix()).toBe("snapshots");
    expect(getSnapshotBucketName()).toBeUndefined();
    expect(isR2SnapshotConfigAvailable()).toBe(false);
    expect(getSnapshotCacheTtlMs()).toBe(60_000);
    expect(getSnapshotFilePath("/career/players.json")).toBe(
      path.resolve(
        process.cwd(),
        "generated",
        "snapshots",
        "career",
        "players.json",
      ),
    );
    expect(getSnapshotObjectKey("/career/players.json")).toBe(
      "snapshots/career/players.json",
    );
    expect(getCareerPlayersSnapshotKey()).toBe("career/players");
    expect(getCareerGoaliesSnapshotKey()).toBe("career/goalies");
    expect(getCareerHighlightsSnapshotKey("most-teams-played")).toBe(
      "career/highlights/most-teams-played",
    );
    expect(getRegularLeaderboardSnapshotKey()).toBe("leaderboard/regular");
    expect(getPlayoffsLeaderboardSnapshotKey()).toBe("leaderboard/playoffs");
    expect(getTransactionsLeaderboardSnapshotKey()).toBe(
      "leaderboard/transactions",
    );
    expect(getCombinedSnapshotKey("players", "both", "7")).toBe(
      "players/combined/both/team-7",
    );
    expect(getSnapshotManifestKey()).toBe("manifest");
  });

  test("uses environment overrides for snapshot settings", () => {
    process.env.SNAPSHOT_DIR = " /tmp/custom-snapshots ";
    process.env.R2_SNAPSHOT_PREFIX = " edge-cache ";
    process.env.R2_BUCKET_NAME = " csv-bucket ";
    process.env.R2_SNAPSHOT_BUCKET_NAME = " snapshot-bucket ";
    process.env.SNAPSHOT_CACHE_TTL_MS = "90000";
    applyR2Env();

    expect(getSnapshotDir()).toBe("/tmp/custom-snapshots");
    expect(getSnapshotPrefix()).toBe("edge-cache");
    expect(getSnapshotBucketName()).toBe("snapshot-bucket");
    expect(getSnapshotCacheTtlMs()).toBe(90_000);
    expect(isR2SnapshotConfigAvailable()).toBe(true);
  });

  test("falls back to the default ttl when the configured value is invalid", () => {
    process.env.SNAPSHOT_CACHE_TTL_MS = "0";

    expect(getSnapshotCacheTtlMs()).toBe(60_000);
  });

  test("throws when creating an R2 client without required configuration", () => {
    expect(() => createSnapshotR2Client()).toThrow(
      "Missing R2 snapshot configuration",
    );
    expect(mockS3Client).not.toHaveBeenCalled();
  });

  test("reuses the R2 client singleton until caches are reset", () => {
    applyR2Env();

    const first = createSnapshotR2Client();
    const second = createSnapshotR2Client();

    expect(first).toBe(second);
    expect(mockS3Client).toHaveBeenCalledTimes(1);

    resetSnapshotCacheForTests();

    const third = createSnapshotR2Client();

    expect(third).not.toBe(first);
    expect(mockS3Client).toHaveBeenCalledTimes(2);
  });

  test("loads local snapshots and re-reads them after the ttl expires", async () => {
    let now = 1_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);
    mockReadFile
      .mockResolvedValueOnce(JSON.stringify({ source: "local-1" }) as never)
      .mockResolvedValueOnce(JSON.stringify({ source: "local-2" }) as never);

    const first = await loadSnapshot<{ source: string }>("career/players");
    now = 1_050;
    const second = await loadSnapshot<{ source: string }>("career/players");
    now = 62_000;
    const third = await loadSnapshot<{ source: string }>("career/players");

    expect(first).toEqual({ source: "local-1" });
    expect(second).toEqual({ source: "local-1" });
    expect(third).toEqual({ source: "local-2" });
    expect(mockReadFile).toHaveBeenCalledTimes(2);
  });

  test("caches missing local snapshots as null", async () => {
    const nowSpy = jest.spyOn(Date, "now");
    nowSpy
      .mockReturnValueOnce(500)
      .mockReturnValueOnce(500)
      .mockReturnValueOnce(550);
    mockReadFile.mockRejectedValue(
      Object.assign(new Error("missing"), { code: "ENOENT" }) as never,
    );

    const first = await loadSnapshot("career/players");
    const second = await loadSnapshot("career/players");

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(mockReadFile).toHaveBeenCalledTimes(1);
    expect(mockSend).not.toHaveBeenCalled();
  });

  test("loads snapshots from R2 when the local file is missing", async () => {
    applyR2Env();
    const transformToString = jest.fn().mockResolvedValue('{"source":"r2"}');
    mockReadFile.mockRejectedValue(
      Object.assign(new Error("missing"), { code: "ENOENT" }) as never,
    );
    mockSend.mockResolvedValue({
      Body: { transformToString },
    });

    const result = await loadSnapshot<{ source: string }>("career/goalies");

    expect(result).toEqual({ source: "r2" });
    expect(mockS3Client).toHaveBeenCalledTimes(1);
    expect(mockGetObjectCommand).toHaveBeenCalledWith({
      Bucket: "csv-bucket",
      Key: "snapshots/career/goalies.json",
    });
    expect(transformToString).toHaveBeenCalledTimes(1);
  });

  test("returns null when the R2 body cannot be transformed", async () => {
    applyR2Env();
    mockReadFile.mockRejectedValue(
      Object.assign(new Error("missing"), { code: "ENOENT" }) as never,
    );
    mockSend.mockResolvedValue({ Body: {} });

    await expect(loadSnapshot("career/goalies")).resolves.toBeNull();
  });

  test("returns null when the R2 object is missing", async () => {
    applyR2Env();
    mockReadFile.mockRejectedValue(
      Object.assign(new Error("missing"), { code: "ENOENT" }) as never,
    );
    mockSend.mockRejectedValue(
      Object.assign(new Error("missing"), { name: "NoSuchKey" }),
    );

    await expect(loadSnapshot("career/goalies")).resolves.toBeNull();
  });

  test("rethrows unexpected local read errors", async () => {
    mockReadFile.mockRejectedValue(
      Object.assign(new Error("denied"), { code: "EACCES" }) as never,
    );

    await expect(loadSnapshot("career/players")).rejects.toThrow("denied");
    expect(mockSend).not.toHaveBeenCalled();
  });

  test("rethrows unexpected R2 errors", async () => {
    applyR2Env();
    mockReadFile.mockRejectedValue(
      Object.assign(new Error("missing"), { code: "ENOENT" }) as never,
    );
    mockSend.mockRejectedValue(new Error("boom"));

    await expect(loadSnapshot("career/goalies")).rejects.toThrow("boom");
  });

  test("rethrows non-Error R2 failures", async () => {
    applyR2Env();
    mockReadFile.mockRejectedValue(
      Object.assign(new Error("missing"), { code: "ENOENT" }) as never,
    );
    mockSend.mockRejectedValue({ status: 500 });

    await expect(loadSnapshot("career/goalies")).rejects.toEqual({
      status: 500,
    });
  });

  test("deduplicates inflight loads for the same snapshot key", async () => {
    let resolveReadFile: ((value: string) => void) | undefined;
    mockReadFile.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveReadFile = resolve;
        }) as ReturnType<typeof fs.readFile>,
    );

    const first = loadSnapshot<{ source: string }>("career/players");
    const second = loadSnapshot<{ source: string }>("career/players");

    expect(mockReadFile).toHaveBeenCalledTimes(1);

    resolveReadFile?.(JSON.stringify({ source: "shared" }));

    await expect(Promise.all([first, second])).resolves.toEqual([
      { source: "shared" },
      { source: "shared" },
    ]);
  });

  test("clears inflight state after a malformed snapshot payload", async () => {
    mockReadFile
      .mockResolvedValueOnce("not-json" as never)
      .mockResolvedValueOnce(JSON.stringify({ source: "fixed" }) as never);

    await expect(loadSnapshot("career/players")).rejects.toThrow();
    await expect(
      loadSnapshot<{ source: string }>("career/players"),
    ).resolves.toEqual({
      source: "fixed",
    });
    expect(mockReadFile).toHaveBeenCalledTimes(2);
  });
});
