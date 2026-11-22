import { execFileSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

// Browser smoke tests (`npm run test:e2e`) against a production build: `next build` + `next start`
// on a free port. Set E2E_SKIP_BUILD=1 to reuse an existing build (CI builds in an earlier step).

// Playwright loads this file in the runner and again in every worker. The port is picked once,
// synchronously, and kept in the environment so every process agrees on it.
if (!process.env.E2E_PORT) {
  process.env.E2E_PORT = execFileSync(process.execPath, [
    "-e",
    "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{process.stdout.write(String(s.address().port));s.close()})",
  ])
    .toString()
    .trim();
}
const port = Number(process.env.E2E_PORT);
const baseURL = `http://localhost:${port}`;
const build = process.env.E2E_SKIP_BUILD ? "" : "npm run build && ";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]]
    : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "phone",
      // Chromium with a phone viewport and touch; Playwright's phone presets use other engines.
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: `${build}npm run start -- -p ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
    env: { NEXT_TELEMETRY_DISABLED: "1" },
  },
});
