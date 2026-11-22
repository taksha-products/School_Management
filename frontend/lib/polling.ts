import axios from "axios";

/** A poll request that has not answered by now is given up, so a stalled network never freezes updates. */
export const POLL_REQUEST_TIMEOUT_MS = 12_000;

/** Failures stretch the poll interval up to this many times (10 s -> 20, 40, 80, 120 s). */
const MAX_BACKOFF_STEPS = 4;
const MAX_BACKOFF_MS = 120_000;
/** Polls are spread by +/-10% so parents who opened the page together do not hit the server in lockstep. */
const JITTER_RATIO = 0.1;

/**
 * When to poll next: the normal interval while all is well, doubling after each consecutive
 * failure (so a struggling server gets room to recover), never sooner than the server asked for
 * (Retry-After), with a little random spread.
 */
export const nextPollDelay = (
  baseMs: number,
  consecutiveFailures: number,
  retryAfterMs = 0,
  random: () => number = Math.random
): number => {
  const steps = Math.min(Math.max(consecutiveFailures, 0), MAX_BACKOFF_STEPS);
  const backedOff = Math.min(baseMs * 2 ** steps, Math.max(MAX_BACKOFF_MS, baseMs));
  const delay = Math.max(backedOff, retryAfterMs);
  const spread = delay * JITTER_RATIO * (random() * 2 - 1);
  return Math.round(delay + spread);
};

/** Reads a Retry-After header (seconds, or an HTTP date) from a failed request, in milliseconds. */
export const retryAfterMsFrom = (error: unknown, now: number = Date.now()): number => {
  const raw: unknown = axios.isAxiosError(error) ? error.response?.headers?.["retry-after"] : undefined;
  if (typeof raw !== "string" || raw.trim() === "") {
    return 0;
  }
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) {
    return Math.max(0, Math.round(seconds * 1000));
  }
  const date = Date.parse(raw);
  return Number.isNaN(date) ? 0 : Math.max(0, date - now);
};

/**
 * Tracks how a polled request is doing, so its interval can back off. A request that was
 * cancelled on purpose (the page closed, the child changed) is not a failure.
 */
export class PollHealth {
  failures = 0;
  retryAfterMs = 0;
  /** The server answered "not yours / not found": asking again will not change that. */
  stopped = false;

  succeeded(): void {
    this.failures = 0;
    this.retryAfterMs = 0;
    this.stopped = false;
  }

  failed(error: unknown): void {
    if (axios.isCancel(error)) {
      return;
    }
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    this.stopped = status === 403 || status === 404;
    this.failures += 1;
    this.retryAfterMs = retryAfterMsFrom(error);
  }
}
