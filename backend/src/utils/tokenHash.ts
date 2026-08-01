import crypto from "crypto";

/**
 * Returns the SHA-256 hex digest of a raw refresh token.
 * Raw tokens are never persisted — only this hash is stored.
 */
export const hashToken = (raw: string): string =>
  crypto.createHash("sha256").update(raw).digest("hex");
