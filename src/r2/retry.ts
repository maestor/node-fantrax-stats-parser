const DEFAULT_R2_SNAPSHOT_MAX_ATTEMPTS = 4;
const DEFAULT_R2_SNAPSHOT_RETRY_BASE_DELAY_MS = 250;

const RETRYABLE_HTTP_STATUS_CODES = new Set([
  408, 425, 429, 500, 502, 503, 504,
]);
const RETRYABLE_ERROR_NAMES = new Set([
  "InternalError",
  "NetworkingError",
  "RequestTimeout",
  "SlowDown",
  "TimeoutError",
]);
const RETRYABLE_ERROR_CODES = new Set([
  "EAI_AGAIN",
  "ECONNABORTED",
  "ECONNRESET",
  "EPIPE",
  "ERR_SOCKET_CONNECTION_TIMEOUT",
  "ERR_SSL_SSL/TLS_ALERT_BAD_RECORD_MAC",
  "ERR_STREAM_PREMATURE_CLOSE",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);
const RETRYABLE_MESSAGE_SNIPPETS = [
  "bad record mac",
  "connection reset",
  "network error",
  "socket hang up",
  "timed out",
] as const;

type RetryableR2Error = Error & {
  $metadata?: {
    httpStatusCode?: number;
  };
  $retryable?: unknown;
  code?: string;
};

export type R2RetryContext = {
  attempt: number;
  delayMs: number;
  error: unknown;
  maxAttempts: number;
  nextAttempt: number;
  operation: string;
};

const getEnv = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};

const parsePositiveInt = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const getRetryDelayMs = (attempt: number): number =>
  getR2SnapshotRetryBaseDelayMs() * 2 ** (attempt - 1);

const sleep = async (delayMs: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });

export const getR2SnapshotMaxAttempts = (): number =>
  parsePositiveInt(getEnv("R2_SNAPSHOT_MAX_ATTEMPTS")) ??
  DEFAULT_R2_SNAPSHOT_MAX_ATTEMPTS;

export const getR2SnapshotRetryBaseDelayMs = (): number =>
  parsePositiveInt(getEnv("R2_SNAPSHOT_RETRY_BASE_DELAY_MS")) ??
  DEFAULT_R2_SNAPSHOT_RETRY_BASE_DELAY_MS;

/** @internal Test-only export for snapshot R2 retry classification coverage. */
export const isRetryableR2Error = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;

  const retryableError = error as RetryableR2Error;
  const statusCode = retryableError.$metadata?.httpStatusCode;
  const code = retryableError.code?.toUpperCase();

  if (retryableError.$retryable) {
    return true;
  }

  if (statusCode && RETRYABLE_HTTP_STATUS_CODES.has(statusCode)) {
    return true;
  }

  if (RETRYABLE_ERROR_NAMES.has(retryableError.name)) {
    return true;
  }

  if (
    code &&
    (RETRYABLE_ERROR_CODES.has(code) ||
      code.includes("TIMEOUT") ||
      code.startsWith("ERR_SSL"))
  ) {
    return true;
  }

  const message = retryableError.message.toLowerCase();
  return RETRYABLE_MESSAGE_SNIPPETS.some((snippet) =>
    message.includes(snippet),
  );
};

export const retryR2Operation = async <T>(
  operation: string,
  run: () => Promise<T>,
  onRetry?: (context: R2RetryContext) => void,
): Promise<T> => {
  const maxAttempts = getR2SnapshotMaxAttempts();

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= maxAttempts || !isRetryableR2Error(error)) {
        throw error;
      }

      const delayMs = getRetryDelayMs(attempt);
      onRetry?.({
        attempt,
        delayMs,
        error,
        maxAttempts,
        nextAttempt: attempt + 1,
        operation,
      });
      await sleep(delayMs);
    }
  }
};
