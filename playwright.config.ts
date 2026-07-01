import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  expect: {
    timeout: 5_000
  },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "list",
  testDir: "./tests/e2e",
  timeout: 30_000,
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