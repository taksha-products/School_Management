export type ParentBusState = "no_bus" | "tracking_unavailable" | "not_running" | "running";

export interface ChildStops {
  pickup: string | null;
  drop: string | null;
}

export interface ParentBusPosition {
  lat: number;
  lng: number;
  speed: number;
  bearing: number;
  lastSeen: string;
  status: "live" | "stopped";
  /** When a stopped bus was last moving (null when moving or unknown). */
  stoppedSince: string | null;
}

/** What the API shows a parent about their child's bus (deliberately minimal). */
export interface ParentBusView {
  state: ParentBusState;
  studentName: string;
  /** The child's own pickup and drop stops. */
  stops: ChildStops | null;
  bus: {
    busId: string;
    busNumber: string;
    routeName: string;
    routeNumber: string | null;
    driverName: string;
  } | null;
  position: ParentBusPosition | null;
}

/** [latitude, longitude, epoch milliseconds] */
export type ParentTrailPoint = [number, number, number];
