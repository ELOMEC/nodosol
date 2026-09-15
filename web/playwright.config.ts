import { defineConfig, devices } from "@playwright/test";

/**
 * Lightweight Playwright config for Nodosol smoke E2Es.
 *
 * The dev server lives at PORT=3000 by default. Tests run against
 * BASE_URL if set (CI / preview deploys), else http://127.0.0.1:3000.
 * `webServer` boots `npm run dev` automatically when the env URL is
 * unset so local runs don't need a separate terminal.
 */

const baseURL = process.env.BASE_URL || "http://127.0.0.1:3000";
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? [["github"], ["list"]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: !isCI,
        timeout: 120_000,
      },
});
