import bcrypt from "bcryptjs";
import crypto from "crypto";
import QRCode from "qrcode";
import speakeasy from "speakeasy";

import { decryptTotpSecret, encryptTotpSecret } from "./totpEncryption";

const BACKUP_CODE_COUNT = 8;
const BACKUP_CODE_BCRYPT_ROUNDS = 10;
const TOTP_WINDOW = 1;

export interface TotpSecretResult {
  secret: string;
  otpauthUrl: string;
}

export interface BackupCodesResult {
  raw: string[];
  hashed: string[];
}

/**
 * Generates a new TOTP secret and otpauth URL for authenticator app enrollment.
 */
export const generateSecret = (
  userEmail: string,
  organizationName: string
): TotpSecretResult => {
  const generated = speakeasy.generateSecret({
    name: `${organizationName}:${userEmail}`,
    issuer: organizationName,
    length: 20
  });

  const secret = generated.base32;
  if (!secret) {
    throw new Error("Failed to generate TOTP secret");
  }

  const otpauthUrl =
    generated.otpauth_url ??
    speakeasy.otpauthURL({
      secret,
      label: `${organizationName}:${userEmail}`,
      issuer: organizationName,
      encoding: "base32"
    });

  return { secret, otpauthUrl };
};

/**
 * Verifies a 6-digit TOTP code against the given base32 secret (±30s window).
 */
export const verifyToken = (secret: string, token: string): boolean =>
  speakeasy.totp.verify({
    secret,
    encoding: "base32",
    token,
    window: TOTP_WINDOW
  });

/**
 * Renders an otpauth URL as a base64 PNG data URL for QR display.
 */
export const generateQRCode = async (otpauthUrl: string): Promise<string> =>
  QRCode.toDataURL(otpauthUrl, { errorCorrectionLevel: "M", margin: 2 });

/**
 * Generates one-time backup codes and their bcrypt hashes for storage.
 */
export const generateBackupCodes = async (): Promise<BackupCodesResult> => {
  const raw: string[] = [];
  const hashed: string[] = [];

  for (let i = 0; i < BACKUP_CODE_COUNT; i += 1) {
    const code = formatBackupCode(crypto.randomBytes(4).toString("hex").slice(0, 8).toUpperCase());
    raw.push(code);
    hashed.push(await bcrypt.hash(code, BACKUP_CODE_BCRYPT_ROUNDS));
  }

  return { raw, hashed };
};

/**
 * Verifies a backup code and returns the remaining hashed codes if valid (one-time use).
 */
export const verifyBackupCode = async (
  inputCode: string,
  hashedCodes: string[]
): Promise<{ valid: boolean; remainingCodes: string[] }> => {
  const normalized = normalizeBackupCode(inputCode);

  for (let i = 0; i < hashedCodes.length; i += 1) {
    const matches = await bcrypt.compare(normalized, hashedCodes[i]);
    if (matches) {
      const remainingCodes = hashedCodes.filter((_, index) => index !== i);
      return { valid: true, remainingCodes };
    }
  }

  return { valid: false, remainingCodes: hashedCodes };
};

/**
 * Encrypts a TOTP secret before persisting to MongoDB.
 */
export const encryptSecretForStorage = (secret: string): string => encryptTotpSecret(secret);

/**
 * Decrypts a stored TOTP secret for verification.
 */
export const decryptSecretFromStorage = (stored: string): string => decryptTotpSecret(stored);

const formatBackupCode = (chars: string): string => {
  const cleaned = chars.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 8);
  const padded = cleaned.padEnd(8, "0");
  return `${padded.slice(0, 4)}-${padded.slice(4, 8)}`;
};

const normalizeBackupCode = (input: string): string => {
  const cleaned = input.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (cleaned.length === 8) {
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}`;
  }
  return input.trim().toUpperCase();
};

/**
 * Returns true when the input looks like a backup code (XXXX-XXXX) rather than a 6-digit TOTP.
 */
export const isBackupCodeFormat = (code: string): boolean =>
  /^\s*[A-Za-z0-9]{4}-[A-Za-z0-9]{4}\s*$/.test(code);
