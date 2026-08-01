"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashToken = void 0;
const crypto_1 = __importDefault(require("crypto"));
/**
 * Returns the SHA-256 hex digest of a raw refresh token.
 * Raw tokens are never persisted — only this hash is stored.
 */
const hashToken = (raw) => crypto_1.default.createHash("sha256").update(raw).digest("hex");
exports.hashToken = hashToken;
