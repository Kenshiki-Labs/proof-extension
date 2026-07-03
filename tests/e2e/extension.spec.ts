import { expect, test } from "@playwright/test"

import { PLAIN_FIXTURE_HTML, readAllEvents, readSummaries, withExtensionContext, withFixtureServer } from "./fixtures"

test("loads the built Chromium extension popup", async () => {
  await withExtensionContext("chromium-extension", async (context, _worker, extensionId) => {
    const page = await context.newPage()
    await page.goto(`chrome-extension://${extensionId}/popup.html`)
    await expect(page.getByText("Pulse Observer")).toBeVisible()
    await expect(page.getByRole("heading", { name: "Watching now" })).toBeVisible()
  })
})

// Main-world hooks are opt-in diagnostics now (spec Phase 2), so page load
// must attach the observer bridge without emitting page observations or
// breaking the page.
test("main-world observer attaches without breaking the page", async () => {
  await withExtensionContext("chromium-observer", async (context, worker) => {
    const page = await context.newPage()

    await withFixtureServer(PLAIN_FIXTURE_HTML, async (baseUrl) => {
      await page.goto(`${baseUrl}/`)
      await expect(page.getByRole("heading", { name: "Plain fixture" })).toBeVisible()

      // The bridge reports itself as a diagnostic, never as page behavior.
      await expect
        .poll(async () => {
          const events = await readAllEvents(worker)
          return events.some((event) => event.eventType === "extension_diagnostic")
        }, { timeout: 15_000 })
        .toBe(true)

      const summaries = await readSummaries(worker)
      const summary = summaries.find((item) => item.origin === new URL(baseUrl).origin)
      const pageActivity = (summary?.events ?? []).filter(
        (event) => event.eventType !== "extension_diagnostic" && event.source !== "extension-scan"
      )
      expect(pageActivity).toEqual([])
    })
  })
})
