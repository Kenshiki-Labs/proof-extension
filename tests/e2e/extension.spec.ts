import { chromium, expect, test } from "@playwright/test"
import path from "node:path"

test("loads the built Chromium extension popup", async () => {
  const extensionPath = path.resolve("build/chrome-mv3-prod")
  const userDataDir = path.resolve(".playwright/user-data/chromium-extension")

  const context = await chromium.launchPersistentContext(userDataDir, {
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    headless: false
  })

  try {
    let [serviceWorker] = context.serviceWorkers()
    serviceWorker ??= await context.waitForEvent("serviceworker")
    const extensionId = serviceWorker.url().split("/")[2]

    const page = await context.newPage()
    await page.goto(`chrome-extension://${extensionId}/popup.html`)
    await expect(page.getByRole("heading", { name: "Pulse Observer" })).toBeVisible()
  } finally {
    await context.close()
  }
})