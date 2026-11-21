import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import type { Request, Response } from "express";

import { requireTraccarWebhookSecret, resetWebhookFailures } from "../middleware/traccarWebhookAuth";

interface Outcome {
  status: number | null;
  nextCalled: boolean;
}

const run = (req: {
  headers?: Record<string, string>;
  query?: Record<string, unknown>;
  ip?: string;
}): Outcome => {
  const outcome: Outcome = { status: null, nextCalled: false };
  const res = {
    status(code: number) {
      outcome.status = code;
      return this;
    },
    json() {
      return this;
    }
  } as unknown as Response;
  requireTraccarWebhookSecret(
    { headers: req.headers ?? {}, query: req.query ?? {}, ip: req.ip } as unknown as Request,
    res,
    () => {
      outcome.nextCalled = true;
    }
  );
  return outcome;
};

const mutableEnv = process.env as Record<string, string | undefined>;
const saved = { secret: mutableEnv.TRACCAR_WEBHOOK_SECRET, env: mutableEnv.NODE_ENV };

const restore = (key: string, value: string | undefined): void => {
  if (value === undefined) {
    delete mutableEnv[key];
  } else {
    mutableEnv[key] = value;
  }
};

beforeEach(() => {
  delete mutableEnv.TRACCAR_WEBHOOK_SECRET;
  resetWebhookFailures();
});
afterEach(() => {
  restore("TRACCAR_WEBHOOK_SECRET", saved.secret);
  restore("NODE_ENV", saved.env);
});

describe("requireTraccarWebhookSecret", () => {
  it("with a secret configured: rejects missing and wrong secrets", () => {
    mutableEnv.TRACCAR_WEBHOOK_SECRET = "s3cret-value";
    assert.deepEqual(run({}), { status: 401, nextCalled: false });
    assert.deepEqual(run({ query: { key: "wrong" } }), { status: 401, nextCalled: false });
    assert.deepEqual(run({ headers: { "x-webhook-secret": "nope" } }), { status: 401, nextCalled: false });
    assert.deepEqual(run({ query: { key: "" } }), { status: 401, nextCalled: false });
  });

  it("with a secret configured: accepts it via query or header", () => {
    mutableEnv.TRACCAR_WEBHOOK_SECRET = "s3cret-value";
    assert.equal(run({ query: { key: "s3cret-value" } }).nextCalled, true);
    assert.equal(run({ headers: { "x-webhook-secret": "s3cret-value" } }).nextCalled, true);
  });

  it("does not accept a secret that is only a prefix, suffix or case variant", () => {
    mutableEnv.TRACCAR_WEBHOOK_SECRET = "s3cret-value";
    for (const attempt of ["s3cret", "s3cret-value-extra", "S3CRET-VALUE", " s3cret-value"]) {
      assert.equal(run({ query: { key: attempt } }).nextCalled, false, attempt);
    }
  });

  it("rejects array / object query values (query-string tricks)", () => {
    mutableEnv.TRACCAR_WEBHOOK_SECRET = "s3cret-value";
    assert.equal(run({ query: { key: ["s3cret-value"] } }).nextCalled, false);
    assert.equal(run({ query: { key: { $ne: "x" } } }).nextCalled, false);
  });

  it("fails closed in production when no secret is configured", () => {
    mutableEnv.NODE_ENV = "production";
    assert.deepEqual(run({}), { status: 503, nextCalled: false });
    assert.deepEqual(run({ query: { key: "anything" } }), { status: 503, nextCalled: false });
  });

  it("allows requests in development when no secret is configured", () => {
    mutableEnv.NODE_ENV = "development";
    assert.equal(run({}).nextCalled, true);
  });

  it("locks an address out after 30 wrong secrets, even for the right secret", () => {
    mutableEnv.TRACCAR_WEBHOOK_SECRET = "s3cret-value";
    for (let i = 0; i < 30; i += 1) {
      assert.equal(run({ ip: "9.9.9.9", query: { key: `guess-${i}` } }).status, 401);
    }
    assert.deepEqual(run({ ip: "9.9.9.9", query: { key: "s3cret-value" } }), { status: 429, nextCalled: false });
  });

  it("never throttles a legitimate server, however many positions it sends", () => {
    mutableEnv.TRACCAR_WEBHOOK_SECRET = "s3cret-value";
    for (let i = 0; i < 5_000; i += 1) {
      assert.equal(run({ ip: "10.0.0.1", query: { key: "s3cret-value" } }).nextCalled, true);
    }
  });

  it("a lockout does not affect other addresses", () => {
    mutableEnv.TRACCAR_WEBHOOK_SECRET = "s3cret-value";
    for (let i = 0; i < 31; i += 1) {
      run({ ip: "9.9.9.9", query: { key: "bad" } });
    }
    assert.equal(run({ ip: "10.0.0.1", query: { key: "s3cret-value" } }).nextCalled, true);
  });
});
