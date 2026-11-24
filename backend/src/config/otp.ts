/**
 * OTP debug mode — controlled only by the OTP_DEBUG environment variable.
 *
 * When on, the OTP request response includes the code (`debugOtp`, shown as
 * "Dev OTP" on the parent login screen) and an SMS failure does not block login.
 * Use for local/staging testing only: with it on, anyone who knows a parent's
 * number can read their login code. Defaults to off when unset.
 *
 * Accepted "on" values: true, 1, yes, on (case-insensitive).
 */
export const isOtpDebugEnabled = (): boolean =>
  ["true", "1", "yes", "on"].includes((process.env.OTP_DEBUG ?? "").trim().toLowerCase());
