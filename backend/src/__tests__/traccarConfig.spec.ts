import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { getTraccarConfig, isTraccarConfigured } from "../config/traccar";

const KEYS = [
  "TRACCAR_URL",
  "TRACCAR_TOKEN",
  "TRACCAR_USER",
  "TRACCAR_PASSWORD",
  "TRACCAR_TIMEOUT_MS"
] as const;
type Key = (typeof KEYS)[number];

const mutableEnv = process.env as Record<string, string | undefined>;
const saved: Record<string, string | undefined> = Object.fromEntries(
  KEYS.map((key) => [key, mutableEnv[key]])
);

const setEnv = (values: Partial<Record<Key, string>>): void => {
  for (const key of KEYS) {
    delete mutableEnv[key];
  }
  Object.assign(mutableEnv, values);
};

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) {
      delete mutableEnv[key];
    } else {
      mutableEnv[key] = saved[key];
    }
  }
});

describe("getTraccarConfig", () => {
  it("is null without a URL or without any credentials", () => {
    setEnv({});
    assert.equal(getTraccarConfig(), null);
    setEnv({ TRACCAR_URL: "http://localhost:8082" });
    assert.equal(getTraccarConfig(), null);
    setEnv({ TRACCAR_TOKEN: "t" });
    assert.equal(isTraccarConfigured(), false);
  });

  it("prefers a token and strips trailing slashes", () => {
    setEnv({
      TRACCAR_URL: "http://localhost:8082///",
      TRACCAR_TOKEN: "tok",
      TRACCAR_USER: "u",
      TRACCAR_PASSWORD: "p"
    });
    const config = getTraccarConfig();
    assert.equal(config?.baseUrl, "http://localhost:8082");
    assert.deepEqual(config?.auth, { type: "bearer", token: "tok" });
  });

  it("falls back to basic auth, needing both user and password", () => {
    setEnv({ TRACCAR_URL: "http://x", TRACCAR_USER: "u" });
    assert.equal(getTraccarConfig(), null);
    setEnv({ TRACCAR_URL: "http://x", TRACCAR_USER: "u", TRACCAR_PASSWORD: "p" });
    assert.deepEqual(getTraccarConfig()?.auth, { type: "basic", username: "u", password: "p" });
  });

  it("uses a sane timeout, ignoring invalid values", () => {
    setEnv({ TRACCAR_URL: "http://x", TRACCAR_TOKEN: "t" });
    assert.equal(getTraccarConfig()?.timeoutMs, 5000);
    setEnv({ TRACCAR_URL: "http://x", TRACCAR_TOKEN: "t", TRACCAR_TIMEOUT_MS: "2500" });
    assert.equal(getTraccarConfig()?.timeoutMs, 2500);
    for (const bad of ["abc", "-5", "0"]) {
      setEnv({ TRACCAR_URL: "http://x", TRACCAR_TOKEN: "t", TRACCAR_TIMEOUT_MS: bad });
      assert.equal(getTraccarConfig()?.timeoutMs, 5000, bad);
    }
  });
});
