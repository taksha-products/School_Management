import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Request, Response } from "express";

import { noStore } from "../middleware/noStore";

describe("noStore", () => {
  it("sets Cache-Control: no-store and continues to the handler", () => {
    const headers: Record<string, string> = {};
    let nextCalled = false;
    const res = {
      setHeader(name: string, value: string) {
        headers[name] = value;
      }
    } as unknown as Response;

    noStore({} as Request, res, () => {
      nextCalled = true;
    });

    assert.equal(headers["Cache-Control"], "no-store");
    assert.equal(nextCalled, true);
  });
});
