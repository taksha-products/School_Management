/**
 * Backend base URL for rewrites and edge middleware.
 * Use a full URL with https:// in production (Vercel env vars).
 */
export const normalizeBackendUrl = (raw?: string | null): string => {
  const fallback = "http://localhost:5000";
  const value = (raw ?? fallback).trim();
  if (!value) {
    return fallback;
  }

  const cleaned = value.replace(/\/+$/, "");
  if (/^https?:\/\//i.test(cleaned)) {
    return cleaned;
  }

  return `https://${cleaned}`;
};

export const getBackendUrl = (): string =>
  normalizeBackendUrl(process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL);
