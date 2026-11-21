import { createHash, timingSafeEqual } from "crypto";
import type { NextFunction, Request, Response } from "express";

let warnedMissingSecret = false;

/**
 * Lockout for secret guessing: after too many wrong secrets from one address, that address is
 * refused for the rest of the window. Only failures are counted, so a legitimate Traccar server
 * (however many positions it sends, however concurrently) is never affected.
 */
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 30;
const MAX_TRACKED_ADDRESSES = 5_000;
const failures = new Map<string, { count: number; resetAt: number }>();

const clientKey = (req: Request): string => req.ip ?? "unknown";

const isLockedOut = (key: string, now: number): boolean => {
  const record = failures.get(key);
  if (!record) {
    return false;
  }
  if (now >= record.resetAt) {
    failures.delete(key);
    return false;
  }
  return record.count >= MAX_FAILURES;
};

const recordFailure = (key: string, now: number): void => {
  if (failures.size >= MAX_TRACKED_ADDRESSES) {
    for (const [address, record] of failures) {
      if (now >= record.resetAt) {
        failures.delete(address);
      }
    }
    if (failures.size >= MAX_TRACKED_ADDRESSES) {
      failures.clear();
    }
  }
  const record = failures.get(key);
  if (record && now < record.resetAt) {
    record.count += 1;
  } else {
    failures.set(key, { count: 1, resetAt: now + FAILURE_WINDOW_MS });
  }
};

/** Test helper: forget all recorded failures. */
export const resetWebhookFailures = (): void => failures.clear();

const digest = (value: string): Buffer => createHash("sha256").update(value).digest();

const constantTimeEquals = (provided: string, expected: string): boolean =>
  timingSafeEqual(digest(provided), digest(expected));

const readProvidedSecret = (req: Request): string | null => {
  const header = req.headers["x-webhook-secret"];
  if (typeof header === "string" && header.length > 0) {
    return header;
  }
  const key = req.query.key;
  if (typeof key === "string" && key.length > 0) {
    return key;
  }
  return null;
};

/**
 * Authenticates the Traccar position forwarder with a shared secret
 * (TRACCAR_WEBHOOK_SECRET), sent as `?key=` on the forward URL or `x-webhook-secret`.
 *
 * - Secret configured: requests without a matching secret are rejected (401).
 * - Secret missing in production: fail closed (503) so positions can never be spoofed.
 * - Secret missing in development: allowed, with a one-time warning.
 */
export const requireTraccarWebhookSecret = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const expected = process.env.TRACCAR_WEBHOOK_SECRET?.trim();

  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      console.error("TRACCAR_WEBHOOK_SECRET is not set; rejecting Traccar webhook requests");
      res.status(503).json({ success: false, message: "Webhook not configured" });
      return;
    }
    if (!warnedMissingSecret) {
      warnedMissingSecret = true;
      console.warn("TRACCAR_WEBHOOK_SECRET is not set; Traccar webhook is unauthenticated (dev only)");
    }
    next();
    return;
  }

  const key = clientKey(req);
  const now = Date.now();

  if (isLockedOut(key, now)) {
    res.status(429).json({ success: false, message: "Too many failed attempts" });
    return;
  }

  const provided = readProvidedSecret(req);
  if (!provided || !constantTimeEquals(provided, expected)) {
    recordFailure(key, now);
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }

  next();
};
