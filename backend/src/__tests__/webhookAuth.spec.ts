import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import type { Request, Response } from "express";

import { requireTraccarWebhookSecret } from "../middleware/traccarWebhookAuth";

interface Outcome {
  status: number | null;
  nextCalled: boolean;
}

const run = (req: { headers?: Record<string, string>; query?: Record<string, unknown> }): Outcome => {
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
    { headers: req.headers ?? {}, query: req.query ?? {} } as unknown as Request,
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
});
