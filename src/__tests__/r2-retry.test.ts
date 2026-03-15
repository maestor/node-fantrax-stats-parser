import {
  getR2SnapshotMaxAttempts,
  getR2SnapshotRetryBaseDelayMs,
  isRetryableR2Error,
  retryR2Operation,
} from "../r2/retry";

const originalEnv = process.env;

describe("r2 retry helpers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    jest.useRealTimers();
    process.env = { ...originalEnv };
    delete process.env.R2_SNAPSHOT_MAX_ATTEMPTS;
    delete process.env.R2_SNAPSHOT_RETRY_BASE_DELAY_MS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("uses default retry settings and honors trimmed environment overrides", () => {
    expect(getR2SnapshotMaxAttempts()).toBe(4);
    expect(getR2SnapshotRetryBaseDelayMs()).toBe(250);

    process.env.R2_SNAPSHOT_MAX_ATTEMPTS = " 6 ";
    process.env.R2_SNAPSHOT_RETRY_BASE_DELAY_MS = " 800 ";

    expect(getR2SnapshotMaxAttempts()).toBe(6);
    expect(getR2SnapshotRetryBaseDelayMs()).toBe(800);
  });

  test("falls back to defaults when retry settings are invalid", () => {
    process.env.R2_SNAPSHOT_MAX_ATTEMPTS = "0";
    process.env.R2_SNAPSHOT_RETRY_BASE_DELAY_MS = "nope";

    expect(getR2SnapshotMaxAttempts()).toBe(4);
    expect(getR2SnapshotRetryBaseDelayMs()).toBe(250);
  });

  test("classifies transient R2 errors as retryable", () => {
    expect(
      isRetryableR2Error(
        Object.assign(new Error("throttled"), { $retryable: {} }),
      ),
    ).toBe(true);
    expect(
      isRetryableR2Error(
        Object.assign(new Error("server error"), {
          $metadata: { httpStatusCode: 503 },
        }),
      ),
    ).toBe(true);
    expect(
      isRetryableR2Error(
        Object.assign(new Error("timed out"), {
          name: "TimeoutError",
        }),
      ),
    ).toBe(true);
    expect(
      isRetryableR2Error(
        Object.assign(new Error("tls alert"), {
          code: "ERR_SSL_SSL/TLS_ALERT_BAD_RECORD_MAC",
        }),
      ),
    ).toBe(true);
    expect(
      isRetryableR2Error(
        Object.assign(new Error("timed out"), {
          code: "CUSTOM_TIMEOUT",
        }),
      ),
    ).toBe(true);
    expect(
      isRetryableR2Error(
        Object.assign(new Error("ssl handshake failed"), {
          code: "ERR_SSL_HANDSHAKE_FAILURE",
        }),
      ),
    ).toBe(true);
    expect(isRetryableR2Error(new Error("socket hang up"))).toBe(true);
  });

  test("does not retry non-transient or non-Error failures", () => {
    expect(isRetryableR2Error(new Error("validation failed"))).toBe(false);
    expect(
      isRetryableR2Error(
        Object.assign(new Error("validation failed"), {
          code: "EACCES",
        }),
      ),
    ).toBe(false);
    expect(isRetryableR2Error({ status: 503 })).toBe(false);
  });

  test("returns immediately when the operation succeeds on the first attempt", async () => {
    const run = jest.fn().mockResolvedValue("ok");

    await expect(retryR2Operation("upload snapshot", run)).resolves.toBe("ok");

    expect(run).toHaveBeenCalledTimes(1);
  });

  test("retries transient failures with exponential backoff and succeeds", async () => {
    jest.useFakeTimers();
    const transientError = Object.assign(new Error("bad record mac"), {
      code: "ERR_SSL_SSL/TLS_ALERT_BAD_RECORD_MAC",
    });
    const run = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(transientError)
      .mockRejectedValueOnce(transientError)
      .mockResolvedValue("uploaded");
    const onRetry = jest.fn();

    const promise = retryR2Operation("upload snapshot", run, onRetry);

    await Promise.resolve();
    expect(onRetry).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        attempt: 1,
        delayMs: 250,
        error: transientError,
        maxAttempts: 4,
        nextAttempt: 2,
        operation: "upload snapshot",
      }),
    );

    await jest.runOnlyPendingTimersAsync();
    await Promise.resolve();

    expect(onRetry).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        attempt: 2,
        delayMs: 500,
        error: transientError,
        maxAttempts: 4,
        nextAttempt: 3,
        operation: "upload snapshot",
      }),
    );

    await jest.runOnlyPendingTimersAsync();
    await expect(promise).resolves.toBe("uploaded");
    expect(run).toHaveBeenCalledTimes(3);
  });

  test("stops retrying when the failure is not retryable", async () => {
    const error = new Error("permission denied");
    const run = jest.fn().mockRejectedValue(error);

    await expect(retryR2Operation("upload snapshot", run)).rejects.toBe(error);

    expect(run).toHaveBeenCalledTimes(1);
  });

  test("stops after the configured maximum number of attempts", async () => {
    jest.useFakeTimers();
    process.env.R2_SNAPSHOT_MAX_ATTEMPTS = "2";
    const transientError = Object.assign(new Error("bad record mac"), {
      code: "ERR_SSL_SSL/TLS_ALERT_BAD_RECORD_MAC",
    });
    const run = jest.fn().mockRejectedValue(transientError);
    const onRetry = jest.fn();

    const promise = retryR2Operation("upload snapshot", run, onRetry);
    const rejection = expect(promise).rejects.toBe(transientError);

    await Promise.resolve();
    expect(onRetry).toHaveBeenCalledTimes(1);

    await jest.runOnlyPendingTimersAsync();
    await rejection;
    expect(run).toHaveBeenCalledTimes(2);
  });
});
