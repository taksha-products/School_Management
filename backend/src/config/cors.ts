/**
 * Allowed browser origins for CORS (HTTP + Socket.IO).
 * FRONTEND_URL accepts a single URL or a comma-separated list,
 * e.g. "http://localhost:3000,http://localhost:8081".
 */
export const getAllowedOrigins = (): string[] => {
  const raw = process.env.FRONTEND_URL || "http://localhost:3000";
  return raw
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
};
