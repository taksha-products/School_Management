export type TraccarAuth =
  | { type: "bearer"; token: string }
  | { type: "basic"; username: string; password: string };

export interface TraccarConfig {
  baseUrl: string;
  auth: TraccarAuth;
  timeoutMs: number;
}

const DEFAULT_TIMEOUT_MS = 8_000;

/**
 * Reads Traccar connection settings from the environment.
 *
 * - TRACCAR_URL            e.g. http://localhost:8082 (no trailing slash needed)
 * - TRACCAR_TOKEN          API token of a Traccar admin user (preferred), or
 * - TRACCAR_USER / TRACCAR_PASSWORD  credentials of a Traccar admin user
 * - TRACCAR_TIMEOUT_MS     optional request timeout
 *
 * Returns null when Traccar is not configured, so callers can degrade gracefully.
 */
export const getTraccarConfig = (): TraccarConfig | null => {
  const rawUrl = process.env.TRACCAR_URL?.trim();
  if (!rawUrl) {
    return null;
  }

  const token = process.env.TRACCAR_TOKEN?.trim();
  const username = process.env.TRACCAR_USER?.trim();
  const password = process.env.TRACCAR_PASSWORD;

  let auth: TraccarAuth;
  if (token) {
    auth = { type: "bearer", token };
  } else if (username && password) {
    auth = { type: "basic", username, password };
  } else {
    return null;
  }

  const parsedTimeout = Number(process.env.TRACCAR_TIMEOUT_MS);
  const timeoutMs =
    Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : DEFAULT_TIMEOUT_MS;

  return { baseUrl: rawUrl.replace(/\/+$/, ""), auth, timeoutMs };
};

export const isTraccarConfigured = (): boolean => getTraccarConfig() !== null;
