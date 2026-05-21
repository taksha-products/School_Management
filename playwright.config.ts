import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45000,
  retries: 2,
  workers: 1,
  use: {
    baseURL: "http://localhost:3000",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15000,
    navigationTimeout: 20000
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  reporter: [["html"], ["list"]]
});
