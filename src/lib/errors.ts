/** An error whose message is written for the seller and can be shown as-is. */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}

export function userMessage(err: unknown, fallback: string): string {
  return err instanceof UserFacingError ? err.message : fallback;
}

/** Firestore error codes that are safe to retry (contention / brief network hiccups). */
const RETRYABLE = new Set(['aborted', 'unavailable', 'deadline-exceeded', 'resource-exhausted']);

interface RetryOptions {
  attempts?: number;
  /** Extra error codes to treat as transient for this particular operation. */
  alsoRetry?: string[];
  /** Stop retrying once this much time has passed since the first attempt. */
  deadlineMs?: number;
}

/** Error for an operation that took too long; retryable like Firestore's own timeouts. */
export class TimeoutError extends Error {
  code = 'deadline-exceeded';
  constructor(message = 'Firestore no respondió a tiempo') {
    super(message);
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError()), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Retries an operation that failed with a transient Firestore error, with jittered backoff
 * (the jitter keeps simultaneous clients from colliding again on the next attempt).
 * Only use it for idempotent operations.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { attempts = 3, alsoRetry = [], deadlineMs = Infinity }: RetryOptions = {},
): Promise<T> {
  const started = Date.now();
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const code = (err as { code?: string })?.code;
      const transient = !!code && (RETRYABLE.has(code) || alsoRetry.includes(code));
      if (i >= attempts || !transient || Date.now() - started > deadlineMs) throw err;
      await new Promise((r) => setTimeout(r, 150 * 2 ** i + Math.random() * 400));
    }
  }
}
