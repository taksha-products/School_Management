import crypto from "crypto";

/** Minimum entropy for one-time org admin credentials (~128 bits). */
const TEMP_PASSWORD_BYTES = 16;

/**
 * Generates a high-entropy temporary password for newly provisioned accounts.
 */
export const generateTemporaryPassword = (): string =>
  crypto.randomBytes(TEMP_PASSWORD_BYTES).toString("base64url");
