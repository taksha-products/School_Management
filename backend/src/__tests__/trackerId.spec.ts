import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeTrackerId, TRACKER_ID_PATTERN } from "../services/busTrackerService";

describe("TRACKER_ID_PATTERN", () => {
  it("accepts IMEIs, phone ids and custom ids", () => {
    for (const ok of ["356938035643809", "BUS-GF-01", "dev:1.a_b", "abc", "x".repeat(64)]) {
      assert.ok(TRACKER_ID_PATTERN.test(ok), ok);
    }
  });

  it("rejects too short, too long and unsafe values", () => {
    const bad = ["", "ab", "x".repeat(65), "has space", "a/b", "a\\b", "a?b", "a&b=1", "<script>", "a\nb", "é-bus", "$ne"];
    for (const value of bad) {
      assert.ok(!TRACKER_ID_PATTERN.test(value), JSON.stringify(value));
    }
  });
});

describe("normalizeTrackerId", () => {
  it("distinguishes untouched, removed and set", () => {
    assert.equal(normalizeTrackerId(undefined), undefined);
    assert.equal(normalizeTrackerId(null), null);
    assert.equal(normalizeTrackerId(""), null);
    assert.equal(normalizeTrackerId("   "), null);
    assert.equal(normalizeTrackerId("  ABC-1  "), "ABC-1");
  });

  it("rejects non-string values (e.g. NoSQL operator objects)", () => {
    for (const bad of [{ $ne: "x" }, ["a"], 123, true]) {
      assert.throws(() => normalizeTrackerId(bad));
    }
  });
});
