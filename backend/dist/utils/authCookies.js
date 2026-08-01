"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearPreAuthCookie = exports.setPreAuthCookie = exports.clearAuthCookies = exports.setAuthCookies = void 0;
const authConstants_1 = require("./authConstants");
const ACCESS_MAX_AGE_MS = authConstants_1.ACCESS_TOKEN_MAX_AGE_SECONDS * 1000;
const REFRESH_MAX_AGE_MS = authConstants_1.REFRESH_TOKEN_MAX_AGE_SECONDS * 1000;
const PRE_AUTH_MAX_AGE_MS = authConstants_1.PRE_AUTH_MAX_AGE_SECONDS * 1000;
const baseCookieOptions = () => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {})
});
/**
 * Sets httpOnly access and refresh token cookies on the response.
 */
const setAuthCookies = (res, accessToken, refreshTokenRaw) => {
    const base = baseCookieOptions();
    res.cookie("access_token", accessToken, {
        ...base,
        maxAge: ACCESS_MAX_AGE_MS,
        path: "/"
    });
    // Clear legacy narrow-path cookie from older deployments.
    res.clearCookie("refresh_token", { ...base, path: "/api/auth/refresh" });
    res.cookie("refresh_token", refreshTokenRaw, {
        ...base,
        maxAge: REFRESH_MAX_AGE_MS,
        path: "/"
    });
};
exports.setAuthCookies = setAuthCookies;
/**
 * Clears both auth cookies (access + refresh).
 */
const clearAuthCookies = (res) => {
    const base = baseCookieOptions();
    res.clearCookie("access_token", { ...base, path: "/" });
    res.clearCookie("refresh_token", { ...base, path: "/" });
    res.clearCookie("refresh_token", { ...base, path: "/api/auth/refresh" });
};
exports.clearAuthCookies = clearAuthCookies;
/**
 * Sets the httpOnly pre-auth cookie for the 2FA verification step.
 */
const setPreAuthCookie = (res, preAuthToken) => {
    const base = baseCookieOptions();
    res.cookie("pre_auth_token", preAuthToken, {
        ...base,
        maxAge: PRE_AUTH_MAX_AGE_MS,
        path: "/api/auth/verify-2fa"
    });
};
exports.setPreAuthCookie = setPreAuthCookie;
/**
 * Clears the pre-auth cookie after 2FA verification or session expiry.
 */
const clearPreAuthCookie = (res) => {
    const base = baseCookieOptions();
    res.clearCookie("pre_auth_token", { ...base, path: "/api/auth/verify-2fa" });
};
exports.clearPreAuthCookie = clearPreAuthCookie;
