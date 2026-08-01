/** Access token lifetime in seconds (default: 8 hours). */
export const ACCESS_TOKEN_MAX_AGE_SECONDS = Number(
  process.env.ACCESS_TOKEN_MAX_AGE_SECONDS ?? 8 * 60 * 60
);

/** Refresh token cookie lifetime in seconds (default: 30 days). */
export const REFRESH_TOKEN_MAX_AGE_SECONDS = Number(
  process.env.REFRESH_TOKEN_MAX_AGE_SECONDS ?? 30 * 24 * 60 * 60
);

/** Pre-auth (2FA step) cookie lifetime in seconds. */
export const PRE_AUTH_MAX_AGE_SECONDS = 5 * 60;
