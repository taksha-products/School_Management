import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

const getEncryptionKey = (): Buffer => {
  const keyHex = process.env.TOTP_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error("TOTP_ENCRYPTION_KEY must be a 32-byte hex string (64 characters)");
  }
  return Buffer.from(keyHex, "hex");
};

/**
 * Encrypts a TOTP secret for storage at rest using AES-256-GCM.
 */
export const encryptTotpSecret = (plaintext: string): string => {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
};

/**
 * Decrypts a TOTP secret previously encrypted with {@link encryptTotpSecret}.
 */
export const decryptTotpSecret = (stored: string): string => {
  const parts = stored.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted TOTP secret format");
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
};
