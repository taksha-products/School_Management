"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRE_AUTH_MAX_AGE_SECONDS = exports.REFRESH_TOKEN_MAX_AGE_SECONDS = exports.ACCESS_TOKEN_MAX_AGE_SECONDS = void 0;
/** Access token lifetime in seconds (default: 8 hours). */
exports.ACCESS_TOKEN_MAX_AGE_SECONDS = Number(process.env.ACCESS_TOKEN_MAX_AGE_SECONDS ?? 8 * 60 * 60);
/** Refresh token cookie lifetime in seconds (default: 30 days). */
exports.REFRESH_TOKEN_MAX_AGE_SECONDS = Number(process.env.REFRESH_TOKEN_MAX_AGE_SECONDS ?? 30 * 24 * 60 * 60);
/** Pre-auth (2FA step) cookie lifetime in seconds. */
exports.PRE_AUTH_MAX_AGE_SECONDS = 5 * 60;
