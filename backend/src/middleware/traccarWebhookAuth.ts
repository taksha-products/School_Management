import { createHash, timingSafeEqual } from "crypto";
import type { NextFunction, Request, Response } from "express";

let warnedMissingSecret = false;

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

  const provided = readProvidedSecret(req);
  if (!provided || !constantTimeEquals(provided, expected)) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }

  next();
};
