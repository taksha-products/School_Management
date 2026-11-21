import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TrailPoint } from "../types/gps";
import { thinTrail } from "../utils/trail";

const makePoints = (count: number): TrailPoint[] =>
  Array.from({ length: count }, (_, i): TrailPoint => [12 + i * 0.0001, 77, 1_000 + i]);

describe("thinTrail", () => {
  it("returns short tracks untouched", () => {
    const points = makePoints(10);
    assert.deepEqual(thinTrail(points, 150), points);
  });

  it("never returns more than the maximum", () => {
    assert.equal(thinTrail(makePoints(5_000), 150).length, 150);
    assert.equal(thinTrail(makePoints(151), 150).length, 150);
  });

  it("keeps the first and the newest point", () => {
    const points = makePoints(1_000);
    const thinned = thinTrail(points, 100);
    assert.deepEqual(thinned[0], points[0]);
    assert.deepEqual(thinned[thinned.length - 1], points[points.length - 1]);
  });

  it("keeps chronological order", () => {
    const thinned = thinTrail(makePoints(777), 90);
    for (let i = 1; i < thinned.length; i += 1) {
      assert.ok(thinned[i]![2] >= thinned[i - 1]![2]);
    }
  });

  it("handles empty input and degenerate limits", () => {
    assert.deepEqual(thinTrail([], 150), []);
    const points = makePoints(10);
    assert.deepEqual(thinTrail(points, 1), points); // a limit below 2 cannot thin meaningfully
  });
});
