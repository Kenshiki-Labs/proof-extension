import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  expect: {
    timeout: 5_000
  },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  reporter: process.env.CI ? "github" : "list",
  // Extension E2E cold-starts a real Chromium with a fresh profile per test;
  // the first run after a full build occasionally times out on service-worker
  // startup under load. One retry absorbs that infra flake — genuine product
  // failures still fail (and retain a trace) on the retry.
  retries: 1,
  testDir: "./tests/e2e",
  timeout: 30_000,
  workers: 1,
  use: {
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium-extension",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
})