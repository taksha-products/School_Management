/**
 * Simulates a bus driving a real road route and reports its position to Traccar the way the
 * Traccar Client phone app does (OsmAnd protocol, HTTP GET). For testing the live map only.
 *
 * Environment:
 *   TRACKER_ID   tracker (device) ID registered on the bus        (default DUMMY-BUS-1)
 *   TRACCAR_OSMAND_URL  Traccar's tracker port                    (default http://traccar:5055)
 *   FROM         "lat,lng" start                                  (default Koramangala)
 *   TO           "lat,lng" end                                    (default Indiranagar)
 *   SPEED_KMH    cruising speed                                   (default 35)
 *   INTERVAL_S   seconds between reports                          (default 3)
 *   DURATION_MIN run this long, driving back and forth (default: one trip)
 *   WEBHOOK_URL, DEVICE_ID   post to the backend webhook instead of Traccar (no Traccar needed)
 *
 * Run inside the backend container (Node 18+, no dependencies):
 *   docker exec -i <backend-container> node - < backend/scripts/simulate-bus.js
 */
const TRACKER_ID = process.env.TRACKER_ID || "DUMMY-BUS-1";
const OSMAND_URL = (process.env.TRACCAR_OSMAND_URL || "http://traccar:5055").replace(/\/$/, "");
const FROM = (process.env.FROM || "12.9345,77.6190").split(",").map(Number);
const TO = (process.env.TO || "12.9716,77.6412").split(",").map(Number);
const SPEED_KMH = Number(process.env.SPEED_KMH || 35);
const INTERVAL_S = Number(process.env.INTERVAL_S || 3);

const KNOTS_PER_KMH = 0.539957;
const EARTH_M = 6371000;
const rad = (d) => (d * Math.PI) / 180;

const distance = (a, b) => {
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.sqrt(h));
};

const bearing = (a, b) => {
  const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]));
  const x =
    Math.cos(rad(a[0])) * Math.sin(rad(b[0])) -
    Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
};

const loadRoute = async () => {
  const url =
    `https://router.project-osrm.org/route/v1/driving/${FROM[1]},${FROM[0]};${TO[1]},${TO[0]}` +
    "?overview=full&geometries=geojson";
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`routing service answered ${response.status}`);
  }
  const body = await response.json();
  const route = body.routes && body.routes[0];
  if (!route) {
    throw new Error("no route found");
  }
  return route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
};

/** Points every `stepM` metres along the polyline. */
const walk = (line, stepM) => {
  const points = [line[0]];
  let carried = 0;
  for (let i = 1; i < line.length; i += 1) {
    let from = line[i - 1];
    const to = line[i];
    let segment = distance(from, to);
    while (carried + segment >= stepM) {
      const t = (stepM - carried) / segment;
      from = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
      points.push(from);
      segment = distance(from, to);
      carried = 0;
    }
    carried += segment;
  }
  points.push(line[line.length - 1]);
  return points;
};

/**
 * Without Traccar (plain local development): post straight to the backend webhook in the format
 * Traccar forwards. Needs WEBHOOK_URL (including ?key=<TRACCAR_WEBHOOK_SECRET>) and DEVICE_ID
 * (the Traccar device id stored on the bus's tracker).
 */
const reportToWebhook = async (point, heading, kmh, battery) => {
  const deviceId = Number(process.env.DEVICE_ID);
  const response = await fetch(process.env.WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      position: {
        deviceId,
        valid: true,
        latitude: point[0],
        longitude: point[1],
        speed: kmh * KNOTS_PER_KMH,
        course: heading,
        fixTime: new Date().toISOString(),
        attributes: { batteryLevel: battery }
      },
      device: { id: deviceId, uniqueId: TRACKER_ID }
    })
  });
  return response.status;
};

const report = async (point, heading, kmh, battery) => {
  if (process.env.WEBHOOK_URL) {
    return reportToWebhook(point, heading, kmh, battery);
  }
  const query = new URLSearchParams({
    id: TRACKER_ID,
    lat: point[0].toFixed(6),
    lon: point[1].toFixed(6),
    speed: (kmh * KNOTS_PER_KMH).toFixed(1), // OsmAnd speed is in knots
    bearing: heading.toFixed(0),
    timestamp: String(Math.floor(Date.now() / 1000)),
    batt: String(battery)
  });
  const response = await fetch(`${OSMAND_URL}/?${query}`);
  return response.status;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const DURATION_MIN = Number(process.env.DURATION_MIN || 0);
const PARK_SECONDS = 30;

(async () => {
  const line = await loadRoute();
  const stepM = (SPEED_KMH / 3.6) * INTERVAL_S;
  const forward = walk(line, stepM);
  console.log(`route: ${forward.length} reports, ~${Math.round(forward.length * INTERVAL_S / 60)} min at ${SPEED_KMH} km/h`);

  // With DURATION_MIN the bus drives out and back along the same road until the time is up.
  const deadline = DURATION_MIN > 0 ? Date.now() + DURATION_MIN * 60_000 : 0;
  const timeIsUp = () => deadline > 0 && Date.now() >= deadline;
  if (deadline) {
    console.log(`running for ${DURATION_MIN} min, back and forth`);
  }

  let battery = 90;
  let failures = 0;
  let trip = 0;

  const send = async (point, heading, kmh, label) => {
    try {
      const status = await report(point, heading, kmh, battery);
      if (status === 200) {
        failures = 0;
      } else {
        failures += 1;
        console.log(`${label}: HTTP ${status}`);
      }
    } catch (error) {
      failures += 1;
      console.log(`${label}: ${error.message}`);
    }
    if (failures > 10) {
      console.log("too many consecutive failures, stopping");
      process.exit(1);
    }
  };

  do {
    const points = trip % 2 === 0 ? forward : [...forward].reverse();
    for (let i = 0; i < points.length && !timeIsUp(); i += 1) {
      const next = points[Math.min(i + 1, points.length - 1)];
      const heading = i < points.length - 1 ? bearing(points[i], next) : bearing(points[i - 1], points[i]);
      // Slow down a little now and then, like traffic.
      const kmh = i % 17 < 3 ? SPEED_KMH * 0.4 : SPEED_KMH;
      await send(points[i], heading, kmh, `trip ${trip + 1} report ${i}`);
      if (i % 20 === 0) {
        battery = Math.max(20, battery - 1);
        console.log(`trip ${trip + 1}: report ${i}/${points.length - 1} at ${points[i][0].toFixed(5)},${points[i][1].toFixed(5)}`);
      }
      await sleep(INTERVAL_S * 1000);
    }
    // Parked at the end of the trip: reports with speed 0.
    const last = points[points.length - 1];
    const stopHeading = bearing(points[points.length - 2], last);
    const parkReports = deadline ? Math.round(PARK_SECONDS / INTERVAL_S) : 3;
    for (let i = 0; i < parkReports && !timeIsUp(); i += 1) {
      await send(last, stopHeading, 0, `trip ${trip + 1} parked`);
      await sleep(INTERVAL_S * 1000);
    }
    trip += 1;
  } while (deadline > 0 && !timeIsUp());

  console.log(`finished after ${trip} trip(s)`);
})().catch((error) => {
  console.error("simulation failed:", error.message);
  process.exit(1);
});
