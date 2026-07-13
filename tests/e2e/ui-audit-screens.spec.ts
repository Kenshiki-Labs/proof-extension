import { mkdir } from "node:fs/promises"
import { expect, test } from "@playwright/test"

import { readAllEvents, stubTrackerRoutes, stubUnknownHostRoute, UNKNOWN_HOST, withExtensionContext, withFixtureServer } from "./fixtures"

// Temporary UI-audit spec: drives a rich fixture through the real pipeline,
// then screenshots every surface for pixel review. Not part of CI — run
// directly and delete/keep as a utility.

const SHOT_DIR = process.env.UI_AUDIT_DIR ?? ".playwright/ui-audit"

const RICH_FIXTURE_HTML = `
  <h1>UI audit fixture</h1>
  <script>
    window.fbq = function () {};
    document.cookie = "audit_pref=value-123456; Path=/"
    localStorage.setItem("audit-theme", "dark-value")
    addEventListener("DOMContentLoaded", () => {
      const ads = new Image(); ads.src = "https://doubleclick.net/pagead/viewthroughconversion/1";
      fetch("https://www.google-analytics.com/g/collect?v=2", { mode: "no-cors" }).catch(() => undefined)
      fetch("https://googleadservices.com/pagead/conversion/1", { mode: "no-cors" }).catch(() => undefined)
      fetch("https://fullstory.com/rec/page", { mode: "no-cors" }).catch(() => undefined)
      fetch("https://rlcdn.com/365868.gif?partner_uid=abc1234567890", { mode: "no-cors" }).catch(() => undefined)
      fetch("https://${UNKNOWN_HOST}/collect?e=pv", { mode: "no-cors" }).catch(() => undefined)
    })
  </script>
`

test("capture UI audit screenshots", async () => {
  test.setTimeout(120_000)
  await mkdir(SHOT_DIR, { recursive: true })

  await withExtensionContext("ui-audit", async (context, worker, extensionId) => {
    await stubTrackerRoutes(context)
    await stubUnknownHostRoute(context)

    await withFixtureServer(RICH_FIXTURE_HTML, async (baseUrl) => {
      const fixturePage = await context.newPage()
      await fixturePage.setViewportSize({ width: 1280, height: 900 })
      await fixturePage.goto(`${baseUrl}/`)

      // Wait until the pipeline has named trackers AND the unknown host.
      await expect
        .poll(
          async () => {
            const events = await readAllEvents(worker)
            return {
              named: ["google-ads", "fullstory", "liveramp"].filter((id) => events.some((event) => event.trackerId === id)).length,
              unknown: events.some((event) => event.details?.host === UNKNOWN_HOST)
            }
          },
          { timeout: 20_000 }
        )
        .toEqual({ named: 3, unknown: true })

      // Popup empty state: popup opened as its own active tab targets itself.
      const emptyPopup = await context.newPage()
      await emptyPopup.setViewportSize({ width: 480, height: 640 })
      await emptyPopup.goto(`chrome-extension://${extensionId}/popup.html`)
      await emptyPopup.waitForTimeout(1_200)
      await emptyPopup.screenshot({ path: `${SHOT_DIR}/popup-empty.png` })

      // Populated popup: reload the popup tab while the FIXTURE tab is the
      // window's active tab, so tabs.query({active:true}) resolves to it.
      await fixturePage.bringToFront()
      await emptyPopup.reload()
      await emptyPopup.waitForTimeout(1_500)
      await emptyPopup.screenshot({ path: `${SHOT_DIR}/popup.png` })

      // Dark mode popup.
      await emptyPopup.emulateMedia({ colorScheme: "dark" })
      await emptyPopup.waitForTimeout(400)
      await emptyPopup.screenshot({ path: `${SHOT_DIR}/popup-dark.png` })
      await emptyPopup.emulateMedia({ colorScheme: "light" })

      // Report views need the fixture tab's numeric id.
      const fixtureTabId = await worker.evaluate(async (url) => {
        const tabs = await chrome.tabs.query({})
        return tabs.find((tab) => tab.url?.startsWith(url))?.id ?? -1
      }, baseUrl)
      expect(fixtureTabId).toBeGreaterThan(0)

      const reportPage = await context.newPage()
      await reportPage.setViewportSize({ width: 1280, height: 900 })

      for (const view of ["evidence", "value", "debug"] as const) {
        await reportPage.goto(`chrome-extension://${extensionId}/tabs/report.html?tabId=${fixtureTabId}&view=${view}`)
        await reportPage.waitForTimeout(1_500)
        // Expand disclosures so the audit sees collapsed content too.
        await reportPage.evaluate(() => {
          for (const details of document.querySelectorAll("details")) details.open = true
        })
        await reportPage.waitForTimeout(300)
        await reportPage.screenshot({ fullPage: true, path: `${SHOT_DIR}/report-${view}.png` })
      }
    })
  })
})
