import type { Request } from "express";

export type ApiClientType = "web" | "mobile";

/**
 * Resolves the API client channel from `x-api-client`.
 * Mobile clients must send `x-api-client: mobile` and use Bearer tokens.
 * Web clients use httpOnly cookies (default).
 */
export const getApiClientType = (req: Request): ApiClientType => {
  const header = req.headers["x-api-client"];
  const value = Array.isArray(header) ? header[0] : header;
  return value === "mobile" ? "mobile" : "web";
};

/** @returns true when the request is from the mobile API client. */
export const isMobileApiClient = (req: Request): boolean => getApiClientType(req) === "mobile";
