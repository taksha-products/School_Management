import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cleanPosition, MAX_FUTURE_SKEW_MS, MAX_SPEED_KMH } from "../services/positionIngest";
import type { TraccarPositionForwarderPayload } from "../types/gps";

const NOW = Date.parse("2026-11-21T12:00:00.000Z");

const base = (over: Partial<TraccarPositionForwarderPayload> = {}): TraccarPositionForwarderPayload => ({
  deviceId: 1,
  valid: true,
  latitude: 12.95,
  longitude: 77.62,
  speed: 10, // knots
  course: 90,
  fixTime: new Date(NOW - 5_000).toISOString(),
  ...over
});

const ok = (over: Partial<TraccarPositionForwarderPayload> = {}) => {
  const result = cleanPosition(base(over), NOW);
  assert.ok(result.ok, "expected the position to be accepted");
  return result.value;
};

const rejected = (over: Partial<TraccarPositionForwarderPayload>): string => {
  const result = cleanPosition(base(over), NOW);
  assert.ok(!result.ok, "expected the position to be rejected");
  return result.reason;
};

describe("cleanPosition: coordinates", () => {
  it("accepts a normal position and converts knots to km/h", () => {
    const value = ok();
    assert.equal(value.lat, 12.95);
    assert.equal(value.speedKmh, 18.5);
  });

  it("accepts the legal extremes", () => {
    for (const [lat, lng] of [[90, 180], [-90, -180], [0, 77], [12, 0]]) {
      ok({ latitude: lat, longitude: lng });
    }
  });

  it("rejects out-of-range and non-finite coordinates", () => {
    for (const [lat, lng] of [[90.0001, 0], [-91, 10], [10, 180.1], [10, -181], [NaN, 1], [1, Infinity]]) {
      rejected({ latitude: lat, longitude: lng });
    }
  });

  it("rejects (0,0) null island but not real points near the equator or prime meridian", () => {
    rejected({ latitude: 0, longitude: 0 });
    rejected({ latitude: 0.000001, longitude: -0.000001 });
    ok({ latitude: 0, longitude: 36.8 });
    ok({ latitude: -1.28, longitude: 0 });
  });
});

describe("cleanPosition: speed", () => {
  it("rejects negative, non-finite and absurd speeds", () => {
    rejected({ speed: -3 });
    rejected({ speed: NaN });
    rejected({ speed: 5_000 });
  });

  it("accepts up to the limit and rejects just above it", () => {
    const limitKnots = MAX_SPEED_KMH / 1.852;
    ok({ speed: limitKnots - 0.1 });
    rejected({ speed: limitKnots + 1 });
    ok({ speed: 0 });
  });
});

describe("cleanPosition: time", () => {
  it("uses the device time when it is sane", () => {
    const value = ok({ fixTime: new Date(NOW - 60_000).toISOString() });
    assert.equal(value.eventTime.getTime(), NOW - 60_000);
    assert.equal(value.clockAhead, false);
  });

  it("keeps old positions (buffered history) as they are", () => {
    const value = ok({ fixTime: new Date(NOW - 3 * 3_600_000).toISOString() });
    assert.equal(value.eventTime.getTime(), NOW - 3 * 3_600_000);
  });

  it("tolerates a small clock skew into the future", () => {
    const value = ok({ fixTime: new Date(NOW + MAX_FUTURE_SKEW_MS - 1).toISOString() });
    assert.equal(value.clockAhead, false);
  });

  it("replaces a timestamp far in the future with server time", () => {
    const value = ok({ fixTime: new Date(NOW + 3_600_000).toISOString() });
    assert.equal(value.clockAhead, true);
    assert.equal(value.eventTime.getTime(), NOW);
    const justOver = ok({ fixTime: new Date(NOW + MAX_FUTURE_SKEW_MS + 1).toISOString() });
    assert.equal(justOver.clockAhead, true);
  });

  it("falls back to server time for garbage timestamps", () => {
    const realNow = Date.now();
    const result = cleanPosition(
      base({ fixTime: "garbage", deviceTime: undefined, serverTime: undefined }),
      realNow
    );
    assert.ok(result.ok);
    assert.ok(Math.abs(result.value.eventTime.getTime() - realNow) < 5_000);
    assert.equal(result.value.clockAhead, false);
  });
});

describe("cleanPosition: other fields", () => {
  it("normalises the bearing into [0, 360)", () => {
    assert.equal(ok({ course: -90 }).bearing, 270);
    assert.equal(ok({ course: 450 }).bearing, 90);
    assert.equal(ok({ course: 360 }).bearing, 0);
    assert.equal(ok({ course: NaN }).bearing, 0);
    assert.equal(ok({ course: 0 }).bearing, 0);
  });

  it("clamps the battery to 0-100 and ignores junk", () => {
    assert.equal(ok({ attributes: { batteryLevel: 150 } }).battery, 100);
    assert.equal(ok({ attributes: { batteryLevel: -20 } }).battery, 0);
    assert.equal(ok({ attributes: { batteryLevel: 55 } }).battery, 55);
    assert.equal(ok({ attributes: {} }).battery, undefined);
    assert.equal(ok({ attributes: { batteryLevel: NaN } }).battery, undefined);
    assert.equal(ok().battery, undefined);
  });

  it("drops negative or non-finite accuracy", () => {
    assert.equal(ok({ accuracy: -1 }).accuracy, undefined);
    assert.equal(ok({ accuracy: NaN }).accuracy, undefined);
    assert.equal(ok({ accuracy: 12 }).accuracy, 12);
  });
});
