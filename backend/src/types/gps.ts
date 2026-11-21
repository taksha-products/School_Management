export interface TraccarPositionAttributes {
  satellites?: number;
  batteryLevel?: number;
  distance?: number;
  totalDistance?: number;
  [key: string]: unknown;
}

/** Position fields sent by the Traccar position forwarder (`forward.enable`, `forward.type=json`). */
export interface TraccarPositionForwarderPayload {
  deviceId: number;
  valid: boolean;
  latitude: number;
  longitude: number;
  speed: number;
  course: number;
  accuracy?: number;
  altitude?: number;
  fixTime?: string;
  deviceTime?: string;
  serverTime?: string;
  attributes?: TraccarPositionAttributes;
}

/** @deprecated Use {@link TraccarPositionForwarderPayload} — notification webhooks are not used. */
export type TraccarWebhookPayload = TraccarPositionForwarderPayload;

export interface GpsPositionUpdateMessage {
  type: "position_update";
  deviceId: string;
  busId: string;
  organizationId: string;
  lat: number;
  lng: number;
  speed: number;
  bearing: number;
  accuracy: number;
  timestamp: string;
}

export type LiveBusStatus = "live" | "stopped" | "offline" | "no_device";

/** A recent track point: [latitude, longitude, epoch milliseconds]. */
export type TrailPoint = [number, number, number];

export interface BusTrail {
  busId: string;
  points: TrailPoint[];
}

/** One active bus with its last known position (cached; status is derived per request). */
export interface LiveBusRow {
  busId: string;
  busNumber: string;
  routeName: string;
  routeNumber: string | null;
  deviceId: string | null;
  lat: number | null;
  lng: number | null;
  speed: number | null;
  bearing: number | null;
  lastSeen: string | null;
  batteryLevel: number | null;
}

export interface LiveBusPosition extends LiveBusRow {
  status: LiveBusStatus;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

const parseAttributes = (value: unknown): TraccarPositionAttributes | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const attributes: TraccarPositionAttributes = {};

  const satellites = parseFiniteNumber(value.satellites);
  if (satellites !== undefined) {
    attributes.satellites = satellites;
  }

  const batteryLevel = parseFiniteNumber(value.batteryLevel);
  if (batteryLevel !== undefined) {
    attributes.batteryLevel = batteryLevel;
  }

  const distance = parseFiniteNumber(value.distance);
  if (distance !== undefined) {
    attributes.distance = distance;
  }

  const totalDistance = parseFiniteNumber(value.totalDistance);
  if (totalDistance !== undefined) {
    attributes.totalDistance = totalDistance;
  }

  return Object.keys(attributes).length > 0 ? attributes : undefined;
};

/**
 * Parses a Traccar position forwarder body. Traccar (forward.type=json) sends
 * `{ "position": {...}, "device": {...} }`; a flat position object is also accepted.
 */
export const parseTraccarPositionForwarderPayload = (
  body: unknown
): TraccarPositionForwarderPayload | null => {
  if (!isRecord(body)) {
    return null;
  }

  const source = isRecord(body.position) ? body.position : body;

  const deviceId = parseFiniteNumber(source.deviceId);
  const valid = source.valid;
  const latitude = parseFiniteNumber(source.latitude);
  const longitude = parseFiniteNumber(source.longitude);
  const speed = parseFiniteNumber(source.speed);
  const course = parseFiniteNumber(source.course);

  if (
    deviceId === undefined ||
    typeof valid !== "boolean" ||
    latitude === undefined ||
    longitude === undefined ||
    speed === undefined ||
    course === undefined
  ) {
    return null;
  }

  return {
    deviceId,
    valid,
    latitude,
    longitude,
    speed,
    course,
    accuracy: parseFiniteNumber(source.accuracy),
    altitude: parseFiniteNumber(source.altitude),
    fixTime: typeof source.fixTime === "string" ? source.fixTime : undefined,
    deviceTime: typeof source.deviceTime === "string" ? source.deviceTime : undefined,
    serverTime: typeof source.serverTime === "string" ? source.serverTime : undefined,
    attributes: parseAttributes(source.attributes)
  };
};

/** @deprecated Use {@link parseTraccarPositionForwarderPayload}. */
export const parseTraccarWebhookPayload = parseTraccarPositionForwarderPayload;

export const knotsToKmh = (knots: number): number =>
  Math.round(knots * 1.852 * 10) / 10;

export const resolveTraccarEventTime = (payload: {
  fixTime?: string;
  deviceTime?: string;
  serverTime?: string;
}): Date => {
  const timeStr = payload.fixTime ?? payload.deviceTime ?? payload.serverTime;
  if (timeStr) {
    const parsed = new Date(timeStr);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date();
};
