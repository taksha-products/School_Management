import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";

import { getTraccarConfig, type TraccarConfig } from "../config/traccar";

export type TraccarErrorKind =
  | "not_configured"
  | "unreachable"
  | "unauthorized"
  | "rejected"
  | "unexpected";

/**
 * Error raised by the Traccar client. `message` is safe to store and show to admins:
 * it never contains credentials, tokens or raw response bodies.
 */
export class TraccarError extends Error {
  constructor(
    public readonly kind: TraccarErrorKind,
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "TraccarError";
  }
}

export interface TraccarDevice {
  id: number;
  name: string;
  uniqueId: string;
  disabled: boolean;
  [key: string]: unknown;
}

/** Connection errors and 5xx are retried once; a timeout is never retried (the admin is waiting). */
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 200;

const isTimeout = (error: unknown): boolean => {
  const code = (error as { code?: string } | null)?.code;
  return code === "ECONNABORTED" || code === "ETIMEDOUT";
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const buildHttp = (config: TraccarConfig): AxiosInstance => {
  const headers: Record<string, string> = { Accept: "application/json" };

  if (config.auth.type === "bearer") {
    headers.Authorization = `Bearer ${config.auth.token}`;
  } else {
    const basic = Buffer.from(`${config.auth.username}:${config.auth.password}`).toString("base64");
    headers.Authorization = `Basic ${basic}`;
  }

  return axios.create({
    baseURL: `${config.baseUrl}/api`,
    timeout: config.timeoutMs,
    headers,
    // Handle status codes ourselves so we can map them to TraccarError.
    validateStatus: () => true
  });
};

interface RequestOptions {
  /** Network errors and 5xx are retried only for idempotent operations. */
  retry: boolean;
  /** Status codes that should be returned instead of thrown. */
  allowStatus?: number[];
}

const request = async <T>(
  axiosConfig: AxiosRequestConfig,
  options: RequestOptions
): Promise<{ status: number; data: T }> => {
  const config = getTraccarConfig();
  if (!config) {
    throw new TraccarError("not_configured", "Traccar is not configured on the server");
  }

  const http = buildHttp(config);
  const attempts = options.retry ? MAX_ATTEMPTS : 1;
  let lastError: TraccarError | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await http.request<T>(axiosConfig);
      const { status } = response;

      if (status >= 200 && status < 300) {
        return { status, data: response.data };
      }
      if (options.allowStatus?.includes(status)) {
        return { status, data: response.data };
      }
      if (status === 401 || status === 403) {
        throw new TraccarError("unauthorized", "Traccar rejected the server credentials", status);
      }
      if (status >= 500) {
        lastError = new TraccarError("unreachable", `Traccar returned an error (${status})`, status);
      } else {
        throw new TraccarError("rejected", `Traccar rejected the request (${status})`, status);
      }
    } catch (error) {
      if (error instanceof TraccarError) {
        if (error.kind !== "unreachable") {
          throw error;
        }
        lastError = error;
      } else if (isTimeout(error)) {
        // Do not retry a timeout: the whole request would take attempts x timeout.
        throw new TraccarError("unreachable", "Traccar did not respond in time");
      } else {
        lastError = new TraccarError("unreachable", "Could not reach the Traccar server");
      }
    }

    if (attempt < attempts) {
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }

  throw lastError ?? new TraccarError("unexpected", "Unexpected Traccar failure");
};

const isTraccarDevice = (value: unknown): value is TraccarDevice => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "number" &&
    Number.isInteger(candidate.id) &&
    typeof candidate.uniqueId === "string"
  );
};

const unexpectedResponse = (): TraccarError =>
  new TraccarError("unexpected", "Traccar returned an unexpected response");

/** A list answer must be an array of well-formed devices; anything else is not Traccar talking. */
const asDeviceList = (data: unknown): TraccarDevice[] => {
  if (!Array.isArray(data) || !data.every(isTraccarDevice)) {
    throw unexpectedResponse();
  }
  return data;
};

/** Finds a device by its unique identifier (IMEI / phone id). */
export const findTraccarDeviceByUniqueId = async (
  uniqueId: string
): Promise<TraccarDevice | null> => {
  const { data } = await request<TraccarDevice[]>(
    { method: "GET", url: "/devices", params: { uniqueId } },
    { retry: true }
  );
  const devices = asDeviceList(data);
  return devices.length > 0 ? (devices[0] ?? null) : null;
};

export const getTraccarDevice = async (id: number): Promise<TraccarDevice | null> => {
  const { data } = await request<TraccarDevice[]>(
    { method: "GET", url: "/devices", params: { id } },
    { retry: true }
  );
  const devices = asDeviceList(data);
  return devices.length > 0 ? (devices[0] ?? null) : null;
};

/**
 * Creates a device, or returns the existing one when the uniqueId is already registered.
 * Safe to call repeatedly (idempotent).
 */
export const ensureTraccarDevice = async (input: {
  name: string;
  uniqueId: string;
}): Promise<TraccarDevice> => {
  const existing = await findTraccarDeviceByUniqueId(input.uniqueId);
  if (existing) {
    if (existing.name !== input.name || existing.disabled) {
      return updateTraccarDevice(existing, { name: input.name, disabled: false });
    }
    return existing;
  }

  try {
    const { data } = await request<unknown>(
      { method: "POST", url: "/devices", data: { name: input.name, uniqueId: input.uniqueId } },
      { retry: false }
    );
    if (!isTraccarDevice(data)) {
      throw unexpectedResponse();
    }
    return data;
  } catch (error) {
    // Lost a race with another request creating the same device: adopt the winner's device.
    if (error instanceof TraccarError && error.kind === "rejected") {
      const winner = await findTraccarDeviceByUniqueId(input.uniqueId);
      if (winner) {
        return winner;
      }
    }
    throw error;
  }
};

/**
 * Updates a device. Traccar's PUT replaces the whole object, so the current device
 * is merged with the requested changes.
 */
export const updateTraccarDevice = async (
  current: TraccarDevice,
  changes: Partial<Pick<TraccarDevice, "name" | "uniqueId" | "disabled">>
): Promise<TraccarDevice> => {
  const merged = { ...current, ...changes };
  const { data } = await request<unknown>(
    { method: "PUT", url: `/devices/${current.id}`, data: merged },
    { retry: true }
  );
  if (!isTraccarDevice(data)) {
    throw unexpectedResponse();
  }
  return data;
};

/** Enables or disables a device without deleting its history. */
export const setTraccarDeviceDisabled = async (id: number, disabled: boolean): Promise<void> => {
  const current = await getTraccarDevice(id);
  if (!current) {
    return;
  }
  if (current.disabled === disabled) {
    return;
  }
  await updateTraccarDevice(current, { disabled });
};
