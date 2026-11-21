import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  knotsToKmh,
  parseTraccarPositionForwarderPayload,
  resolveTraccarEventTime
} from "../types/gps";

/** Exact shape captured from a real Traccar server (forward.type=json, OsmAnd device). */
const realTraccarBody = {
  position: {
    id: 0,
    attributes: { batteryLevel: 70, distance: 0, totalDistance: 0, motion: true },
    deviceId: 3,
    protocol: "osmand",
    serverTime: "2026-11-21T11:44:26.115+00:00",
    deviceTime: "2026-11-21T11:44:26.122+00:00",
    fixTime: "2026-11-21T11:44:26.122+00:00",
    valid: true,
    latitude: 12.9352,
    longitude: 77.6245,
    altitude: 0,
    speed: 5,
    course: 90,
    address: null,
    accuracy: 0,
    network: null,
    geofenceIds: null
  },
  device: { id: 3, name: "capture-test", uniqueId: "CAPTURE-TEST-2", status: "online" }
};

describe("parseTraccarPositionForwarderPayload", () => {
  it("parses the real wrapped Traccar payload", () => {
    const parsed = parseTraccarPositionForwarderPayload(realTraccarBody);
    assert.ok(parsed);
    assert.equal(parsed.deviceId, 3);
    assert.equal(parsed.latitude, 12.9352);
    assert.equal(parsed.longitude, 77.6245);
    assert.equal(parsed.speed, 5);
    assert.equal(parsed.course, 90);
    assert.equal(parsed.valid, true);
    assert.equal(parsed.attributes?.batteryLevel, 70);
  });

  it("still accepts a flat position object", () => {
    const parsed = parseTraccarPositionForwarderPayload(realTraccarBody.position);
    assert.equal(parsed?.deviceId, 3);
  });

  it("accepts numbers sent as strings", () => {
    const parsed = parseTraccarPositionForwarderPayload({
      position: { ...realTraccarBody.position, latitude: "12.5", longitude: "77.5", speed: "3" }
    });
    assert.equal(parsed?.latitude, 12.5);
    assert.equal(parsed?.speed, 3);
  });

  it("rejects anything that is not a position", () => {
    for (const bad of [null, undefined, 42, "x", [], {}, { position: {} }, { position: "nope" }]) {
      assert.equal(parseTraccarPositionForwarderPayload(bad), null);
    }
  });

  it("rejects missing, NaN and non-finite required fields", () => {
    const base = realTraccarBody.position;
    for (const patch of [
      { deviceId: undefined },
      { latitude: undefined },
      { longitude: "abc" },
      { speed: NaN },
      { course: Infinity },
      { valid: "true" }
    ]) {
      assert.equal(parseTraccarPositionForwarderPayload({ position: { ...base, ...patch } }), null);
    }
  });

  it("ignores prototype-pollution style keys", () => {
    const body: unknown = JSON.parse(
      '{"position":{"deviceId":1,"valid":true,"latitude":1,"longitude":2,"speed":0,"course":0},"__proto__":{"polluted":true}}'
    );
    const parsed = parseTraccarPositionForwarderPayload(body);
    assert.ok(parsed);
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
  });
});

describe("knotsToKmh", () => {
  it("converts and rounds to one decimal", () => {
    assert.equal(knotsToKmh(0), 0);
    assert.equal(knotsToKmh(10), 18.5);
    assert.equal(knotsToKmh(1), 1.9);
  });
});

describe("resolveTraccarEventTime", () => {
  it("prefers fixTime, then deviceTime, then serverTime", () => {
    assert.equal(
      resolveTraccarEventTime({ fixTime: "2026-01-01T00:00:00Z", deviceTime: "2026-02-01T00:00:00Z" }).toISOString(),
      "2026-01-01T00:00:00.000Z"
    );
    assert.equal(
      resolveTraccarEventTime({ deviceTime: "2026-02-01T00:00:00Z", serverTime: "2026-03-01T00:00:00Z" }).toISOString(),
      "2026-02-01T00:00:00.000Z"
    );
  });

  it("falls back to now for missing or unparseable times", () => {
    const before = Date.now();
    const a = resolveTraccarEventTime({});
    const b = resolveTraccarEventTime({ fixTime: "not a date" });
    assert.ok(a.getTime() >= before && b.getTime() >= before);
  });
});
