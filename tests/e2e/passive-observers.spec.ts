import { expect, test } from "@playwright/test"

import { readAllEvents, withExtensionContext, withFixtureServer } from "./fixtures"

// The WebRTC and device-field observers are default-on (observe-only, no
// opt-in): they name capabilities the extension cannot block, so they must
// fire the moment a page uses them. This drives a page that constructs an
// RTCPeerConnection and reads high-entropy device fields, then asserts the
// store recorded both — with the extension's own rebuilt evidence, never the
// page's, and never an actual IP or field value.
const PASSIVE_FIXTURE_HTML = `<!DOCTYPE html>
<html>
  <head><title>Passive observers fixture</title></head>
  <body>
    <h1>Passive observers fixture</h1>
    <script>
      try { new RTCPeerConnection({ iceServers: [] }) } catch (error) {}
      // Reading these triggers the device-field getters.
      window.__cores = navigator.hardwareConcurrency
      window.__tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    </script>
  </body>
</html>`

test("WebRTC and device-field reads are observed and recorded with rebuilt evidence", async () => {
  await withExtensionContext("passive-observers", async (context, worker, extensionId) => {
    await withFixtureServer(PASSIVE_FIXTURE_HTML, async (baseUrl) => {
      const page = await context.newPage()
      await page.goto(`${baseUrl}/`)
      await expect(page.getByRole("heading", { name: "Passive observers fixture" })).toBeVisible()

      await expect
        .poll(
          async () => {
            const events = await readAllEvents(worker)
            const webrtc = events.find((event) => event.eventType === "webrtc_probe")
            const deviceField = events.find((event) => event.eventType === "device_field_read")
            if (!webrtc || !deviceField) return null
            return {
              webrtcEvidence: webrtc.evidence.join(" "),
              deviceEvidence: deviceField.evidence.join(" "),
              webrtcStatus: webrtc.status,
              deviceStatus: deviceField.status
            }
          },
          { timeout: 15_000 }
        )
        .toEqual(
          expect.objectContaining({
            webrtcStatus: "active",
            deviceStatus: "active"
          })
        )

      // Evidence is the extension's, and carries no address or value.
      const events = await readAllEvents(worker)
      const webrtc = events.find((event) => event.eventType === "webrtc_probe")!
      const deviceField = events.find((event) => event.eventType === "device_field_read")!
      expect(webrtc.evidence.join(" ")).toContain("WebRTC")
      expect(deviceField.evidence.join(" ")).toContain("value was not recorded")

      // The digest must actually surface in the report — not just sit in the
      // store. Open the evidence view and assert the audit brief names the
      // first-party fingerprinting the page did, WebRTC included.
      const tabId = await worker.evaluate(async (url) => {
        const tabs = await chrome.tabs.query({})
        return tabs.find((tab) => tab.url?.startsWith(url))?.id ?? -1
      }, baseUrl)
      expect(tabId).toBeGreaterThan(0)

      const reportPage = await context.newPage()
      await reportPage.goto(`chrome-extension://${extensionId}/tabs/report.html?tabId=${tabId}&view=evidence`)

      const takeaway = reportPage.locator("li", { hasText: "first-party fingerprinting" })
      await expect(takeaway).toBeVisible({ timeout: 15_000 })
      await expect(takeaway).toContainText("WebRTC")
    })
  })
})
