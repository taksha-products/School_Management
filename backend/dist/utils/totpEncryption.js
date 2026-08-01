"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.decryptTotpSecret = exports.encryptTotpSecret = void 0;
const crypto_1 = __importDefault(require("crypto"));
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const getEncryptionKey = () => {
    const keyHex = process.env.TOTP_ENCRYPTION_KEY;
    if (!keyHex || keyHex.length !== 64) {
        throw new Error("TOTP_ENCRYPTION_KEY must be a 32-byte hex string (64 characters)");
    }
    return Buffer.from(keyHex, "hex");
};
/**
 * Encrypts a TOTP secret for storage at rest using AES-256-GCM.
 */
const encryptTotpSecret = (plaintext) => {
    const key = getEncryptionKey();
    const iv = crypto_1.default.randomBytes(IV_LENGTH);
    const cipher = crypto_1.default.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
};
exports.encryptTotpSecret = encryptTotpSecret;
/**
 * Decrypts a TOTP secret previously encrypted with {@link encryptTotpSecret}.
 */
const decryptTotpSecret = (stored) => {
    const parts = stored.split(":");
    if (parts.length !== 3) {
        throw new Error("Invalid encrypted TOTP secret format");
    }
    const [ivHex, authTagHex, ciphertextHex] = parts;
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const ciphertext = Buffer.from(ciphertextHex, "hex");
    const decipher = crypto_1.default.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
};
exports.decryptTotpSecret = decryptTotpSecret;
