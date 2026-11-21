import type { Response } from "express";

import {
  ACCESS_TOKEN_MAX_AGE_SECONDS,
  PRE_AUTH_MAX_AGE_SECONDS,
  REFRESH_TOKEN_MAX_AGE_SECONDS
} from "./authConstants";

const ACCESS_MAX_AGE_MS = ACCESS_TOKEN_MAX_AGE_SECONDS * 1000;
const REFRESH_MAX_AGE_MS = REFRESH_TOKEN_MAX_AGE_SECONDS * 1000;
const PRE_AUTH_MAX_AGE_MS = PRE_AUTH_MAX_AGE_SECONDS * 1000;

const resolveCookieSecure = (): boolean => {
  if (process.env.COOKIE_SECURE === "true") {
    return true;
  }
  if (process.env.COOKIE_SECURE === "false") {
    return false;
  }
  return process.env.NODE_ENV === "production";
};

const baseCookieOptions = (): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "strict" | "lax";
  domain?: string;
} => ({
  httpOnly: true,
  secure: resolveCookieSecure(),
  // lax keeps web auth cookies working across local docker HTTP redirects
  sameSite: resolveCookieSecure() ? "strict" : "lax",
  ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {})
});

/**
 * Sets httpOnly access and refresh token cookies on the response.
 */
export const setAuthCookies = (
  res: Response,
  accessToken: string,
  refreshTokenRaw: string
): void => {
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

/**
 * Clears both auth cookies (access + refresh).
 */
export const clearAuthCookies = (res: Response): void => {
  const base = baseCookieOptions();

  res.clearCookie("access_token", { ...base, path: "/" });
  res.clearCookie("refresh_token", { ...base, path: "/" });
  res.clearCookie("refresh_token", { ...base, path: "/api/auth/refresh" });
};

/**
 * Sets the httpOnly pre-auth cookie for the 2FA verification step.
 */
export const setPreAuthCookie = (res: Response, preAuthToken: string): void => {
  const base = baseCookieOptions();

  res.cookie("pre_auth_token", preAuthToken, {
    ...base,
    maxAge: PRE_AUTH_MAX_AGE_MS,
    path: "/api/auth/verify-2fa"
  });
};

/**
 * Clears the pre-auth cookie after 2FA verification or session expiry.
 */
export const clearPreAuthCookie = (res: Response): void => {
  const base = baseCookieOptions();
  res.clearCookie("pre_auth_token", { ...base, path: "/api/auth/verify-2fa" });
};
