"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isBackupCodeFormat = exports.decryptSecretFromStorage = exports.encryptSecretForStorage = exports.verifyBackupCode = exports.generateBackupCodes = exports.generateQRCode = exports.verifyToken = exports.generateSecret = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = __importDefault(require("crypto"));
const qrcode_1 = __importDefault(require("qrcode"));
const speakeasy_1 = __importDefault(require("speakeasy"));
const totpEncryption_1 = require("./totpEncryption");
const BACKUP_CODE_COUNT = 8;
const BACKUP_CODE_BCRYPT_ROUNDS = 10;
const TOTP_WINDOW = 1;
/**
 * Generates a new TOTP secret and otpauth URL for authenticator app enrollment.
 */
const generateSecret = (userEmail, organizationName) => {
    const generated = speakeasy_1.default.generateSecret({
        name: `BusTrack:${userEmail}`,
        issuer: organizationName,
        length: 20
    });
    const secret = generated.base32;
    if (!secret) {
        throw new Error("Failed to generate TOTP secret");
    }
    const otpauthUrl = generated.otpauth_url ??
        speakeasy_1.default.otpauthURL({
            secret,
            label: `BusTrack:${userEmail}`,
            issuer: organizationName,
            encoding: "base32"
        });
    return { secret, otpauthUrl };
};
exports.generateSecret = generateSecret;
/**
 * Verifies a 6-digit TOTP code against the given base32 secret (±30s window).
 */
const verifyToken = (secret, token) => speakeasy_1.default.totp.verify({
    secret,
    encoding: "base32",
    token,
    window: TOTP_WINDOW
});
exports.verifyToken = verifyToken;
/**
 * Renders an otpauth URL as a base64 PNG data URL for QR display.
 */
const generateQRCode = async (otpauthUrl) => qrcode_1.default.toDataURL(otpauthUrl, { errorCorrectionLevel: "M", margin: 2 });
exports.generateQRCode = generateQRCode;
/**
 * Generates one-time backup codes and their bcrypt hashes for storage.
 */
const generateBackupCodes = async () => {
    const raw = [];
    const hashed = [];
    for (let i = 0; i < BACKUP_CODE_COUNT; i += 1) {
        const code = formatBackupCode(crypto_1.default.randomBytes(4).toString("hex").slice(0, 8).toUpperCase());
        raw.push(code);
        hashed.push(await bcryptjs_1.default.hash(code, BACKUP_CODE_BCRYPT_ROUNDS));
    }
    return { raw, hashed };
};
exports.generateBackupCodes = generateBackupCodes;
/**
 * Verifies a backup code and returns the remaining hashed codes if valid (one-time use).
 */
const verifyBackupCode = async (inputCode, hashedCodes) => {
    const normalized = normalizeBackupCode(inputCode);
    for (let i = 0; i < hashedCodes.length; i += 1) {
        const matches = await bcryptjs_1.default.compare(normalized, hashedCodes[i]);
        if (matches) {
            const remainingCodes = hashedCodes.filter((_, index) => index !== i);
            return { valid: true, remainingCodes };
        }
    }
    return { valid: false, remainingCodes: hashedCodes };
};
exports.verifyBackupCode = verifyBackupCode;
/**
 * Encrypts a TOTP secret before persisting to MongoDB.
 */
const encryptSecretForStorage = (secret) => (0, totpEncryption_1.encryptTotpSecret)(secret);
exports.encryptSecretForStorage = encryptSecretForStorage;
/**
 * Decrypts a stored TOTP secret for verification.
 */
const decryptSecretFromStorage = (stored) => (0, totpEncryption_1.decryptTotpSecret)(stored);
exports.decryptSecretFromStorage = decryptSecretFromStorage;
const formatBackupCode = (chars) => {
    const cleaned = chars.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 8);
    const padded = cleaned.padEnd(8, "0");
    return `${padded.slice(0, 4)}-${padded.slice(4, 8)}`;
};
const normalizeBackupCode = (input) => {
    const cleaned = input.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (cleaned.length === 8) {
        return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}`;
    }
    return input.trim().toUpperCase();
};
/**
 * Returns true when the input looks like a backup code (XXXX-XXXX) rather than a 6-digit TOTP.
 */
const isBackupCodeFormat = (code) => /^\s*[A-Za-z0-9]{4}-[A-Za-z0-9]{4}\s*$/.test(code);
exports.isBackupCodeFormat = isBackupCodeFormat;
