// Runs every unit test in src/__tests__. Node 20 does not expand glob patterns for
// `node --test`, so the spec files are listed explicitly (works on every Node version).
const { spawnSync } = require("node:child_process");
const { readdirSync } = require("node:fs");
const path = require("node:path");

const dir = path.join(__dirname, "..", "src", "__tests__");
const files = readdirSync(dir)
  .filter((name) => name.endsWith(".spec.ts"))
  .sort()
  .map((name) => path.join(dir, name));

const result = spawnSync(
  process.execPath,
  ["--require", "ts-node/register/transpile-only", "--test", ...files],
  { stdio: "inherit", cwd: path.join(__dirname, "..") }
);
process.exit(result.status ?? 1);
