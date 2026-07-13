import http from "node:http"

import { expect, test } from "@playwright/test"
import type { BrowserContext, Page, Worker } from "@playwright/test"

import { readAllEvents, withExtensionContext } from "./fixtures"

// End-to-end acceptance for the 0.6 privacy controls, driven the way a user
// drives them: flip the toggle on the real options page, reload, and observe
// what the page (and the network) actually sees. These tests exist because
// both features are protection claims — the exact thing the extension must
// never get wrong.

const GPC_RULE_ID = 9_999

const CANVAS_FIXTURE_HTML = `<!DOCTYPE html>
<html>
  <head><title>Canvas fixture</title></head>
  <body>
    <h1>Canvas fixture</h1>
    <canvas id="c" width="200" height="50"></canvas>
    <script>
      const canvas = document.getElementById("c")
      const context = canvas.getContext("2d")
      const gradient = context.createLinearGradient(0, 0, 200, 0)
      gradient.addColorStop(0, "#ff6600")
      gradient.addColorStop(1, "#0066ff")
      context.fillStyle = gradient
      context.fillRect(0, 0, 200, 50)
      context.fillStyle = "#123456"
      context.font = "16px sans-serif"
      context.fillText("fingerprint me", 8, 30)
      window.readCanvas = () => canvas.toDataURL()
    </script>
  </body>
</html>`

const GPC_FIXTURE_HTML = `<!DOCTYPE html>
<html>
  <head><title>GPC fixture</title></head>
  <body><h1>GPC fixture</h1></body>
</html>`

async function setOptionsToggle(context: BrowserContext, extensionId: string, labelText: string, checked: boolean) {
  const optionsPage = await context.newPage()
  await optionsPage.goto(`chrome-extension://${extensionId}/options.html`)
  const checkbox = optionsPage.locator("label", { hasText: labelText }).locator("input[type=checkbox]").first()
  await expect(checkbox).toBeVisible()
  if ((await checkbox.isChecked()) !== checked) await checkbox.click()
  await expect(checkbox).toBeChecked({ checked })
  await optionsPage.close()
}

// The options page updates its own state optimistically, so the toggle being
// checked does not prove the background applied the setting. Wait on the
// persisted settings instead — the deterministic signal a reload depends on.
async function waitForStoredSetting(worker: Worker, key: string, value: boolean) {
  await expect
    .poll(
      async () => {
        const stored = (await worker.evaluate(() => chrome.storage.local.get("userSettings"))) as {
          userSettings?: Record<string, unknown>
        }
        return stored.userSettings?.[key]
      },
      { timeout: 15_000 }
    )
    .toBe(value)
}

async function waitForGpcRuleInstalled(worker: Worker, installed: boolean) {
  await expect
    .poll(
      async () =>
        worker.evaluate(
          (ruleId) => chrome.declarativeNetRequest.getDynamicRules().then((rules) => rules.some((rule) => rule.id === ruleId)),
          GPC_RULE_ID
        ),
      { timeout: 15_000 }
    )
    .toBe(installed)
}

async function waitForSyncedFlag(page: Page, datasetKey: string, value: string) {
  await page.waitForFunction(
    ([key, expected]) => document.documentElement.dataset[key] === expected,
    [datasetKey, value] as [string, string],
    { timeout: 15_000 }
  )
}

// Serves fixture HTML while recording the Sec-GPC request header for every
// request (main frame, favicon, all of it), so the header claim is verified
// on the wire — not at the JS layer.
async function withHeaderRecordingServer(
  html: string,
  run: (baseUrl: string, seenGpcHeaders: (string | null)[]) => Promise<void>
) {
  const seenGpcHeaders: (string | null)[] = []
  const server = http.createServer((request, response) => {
    seenGpcHeaders.push(request.headers["sec-gpc"] === undefined ? null : String(request.headers["sec-gpc"]))
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" })
    response.end(html)
  })

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Fixture server did not expose a port")

  try {
    await run(`http://127.0.0.1:${address.port}`, seenGpcHeaders)
  } finally {
    server.closeIdleConnections?.()
    server.closeAllConnections?.()
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  }
}

test("canvas mitigation noises exports only after opt-in, stably within a session, and records mitigated evidence", async () => {
  await withExtensionContext("privacy-canvas", async (context, worker, extensionId) => {
    await withHeaderRecordingServer(CANVAS_FIXTURE_HTML, async (baseUrl) => {
      // Default off: the export must be byte-identical to what the page drew.
      const page = await context.newPage()
      await page.goto(`${baseUrl}/`)
      await waitForSyncedFlag(page, "proofExtensionMitigateCanvas", "false")
      const unmitigated = await page.evaluate(() => (window as never as { readCanvas: () => string }).readCanvas())
      const unmitigatedRepeat = await page.evaluate(() => (window as never as { readCanvas: () => string }).readCanvas())
      expect(unmitigatedRepeat).toBe(unmitigated)

      await setOptionsToggle(context, extensionId, "mitigate canvas", true)
      await waitForStoredSetting(worker, "mitigateCanvas", true)

      await page.reload()
      await waitForSyncedFlag(page, "proofExtensionMitigateCanvas", "true")
      const mitigated = await page.evaluate(() => (window as never as { readCanvas: () => string }).readCanvas())
      const mitigatedRepeat = await page.evaluate(() => (window as never as { readCanvas: () => string }).readCanvas())

      // Noised — but deterministically within the session: a per-call random
      // would be trivially detectable by diffing two reads.
      expect(mitigated).not.toBe(unmitigated)
      expect(mitigatedRepeat).toBe(mitigated)

      // The evidence store must carry the read as mitigated — which the
      // background only grants because the setting is genuinely on.
      await expect
        .poll(async () => {
          const events = await readAllEvents(worker)
          return events.some((event) => event.eventType === "canvas_read" && event.status === "mitigated")
        }, { timeout: 15_000 })
        .toBe(true)
    })
  })
})

test("GPC is silent by default and, once opted in, appears on the wire and on navigator", async () => {
  await withExtensionContext("privacy-gpc", async (context, worker, extensionId) => {
    await withHeaderRecordingServer(GPC_FIXTURE_HTML, async (baseUrl, seenGpcHeaders) => {
      // Default off: no header on the wire, no JS surface a site can read —
      // installing the extension never changes what a site receives.
      const page = await context.newPage()
      await page.goto(`${baseUrl}/`)
      await waitForSyncedFlag(page, "proofExtensionGpc", "false")
      expect(seenGpcHeaders.every((header) => header === null)).toBe(true)
      expect(await page.evaluate(() => "globalPrivacyControl" in navigator)).toBe(false)

      await setOptionsToggle(context, extensionId, "send Global Privacy Control", true)
      await waitForStoredSetting(worker, "gpcEnabled", true)
      await waitForGpcRuleInstalled(worker, true)

      const requestsBeforeEnabledReload = seenGpcHeaders.length
      await page.reload()
      await waitForSyncedFlag(page, "proofExtensionGpc", "true")
      const enabledPhase = seenGpcHeaders.slice(requestsBeforeEnabledReload)
      expect(enabledPhase.length).toBeGreaterThan(0)
      expect(enabledPhase.every((header) => header === "1")).toBe(true)
      expect(
        await page.evaluate(() => (navigator as never as { globalPrivacyControl?: boolean }).globalPrivacyControl)
      ).toBe(true)

      // Turning it off applies to the next page load: header gone from the
      // wire, JS surface gone from navigator.
      await setOptionsToggle(context, extensionId, "send Global Privacy Control", false)
      await waitForStoredSetting(worker, "gpcEnabled", false)
      await waitForGpcRuleInstalled(worker, false)

      const requestsBeforeDisabledReload = seenGpcHeaders.length
      await page.reload()
      await waitForSyncedFlag(page, "proofExtensionGpc", "false")
      const disabledPhase = seenGpcHeaders.slice(requestsBeforeDisabledReload)
      expect(disabledPhase.length).toBeGreaterThan(0)
      expect(disabledPhase.every((header) => header === null)).toBe(true)
      expect(await page.evaluate(() => "globalPrivacyControl" in navigator)).toBe(false)
    })
  })
})
