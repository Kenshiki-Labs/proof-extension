import http from "node:http"

import { expect, test } from "@playwright/test"
import type { Worker } from "@playwright/test"

import { withExtensionContext } from "./fixtures"

// The shim resources (shims/gtag.js, shims/pixel.gif) are web_accessible so a
// DNR redirect can serve them in place of a tracker's script/beacon, and they
// are marked use_dynamic_url to keep a web page from probing their static
// chrome-extension://<id>/… path to detect the extension and lift its stable
// id. use_dynamic_url is precisely the setting that could silently break the
// page-safe shim feature (the extension's own redirect resolves to the static
// resource URL), so this test pins that the redirect STILL delivers the
// resource with the flag on.
//
// Note on the probe half: the anti-probe effect of use_dynamic_url is only
// enforced for packed/store installs. This suite loads the extension UNPACKED
// (--load-extension), where the static resource URL stays fetchable regardless
// of the flag — verified here as identical with and without it — so the probe
// being closed cannot be asserted from Playwright and must be spot-checked on
// a packed build.

const PROBE_PATH = "/shim-redirect-probe.gif"
const PROBE_RULE_ID = 22_000

async function installProbeRedirect(worker: Worker) {
  await worker.evaluate(
    ({ ruleId, path }) =>
      chrome.declarativeNetRequest.updateDynamicRules({
        addRules: [
          {
            id: ruleId,
            priority: 1,
            action: {
              type: "redirect" as chrome.declarativeNetRequest.RuleActionType,
              redirect: { extensionPath: "/shims/pixel.gif" }
            },
            condition: {
              urlFilter: `*${path}`,
              resourceTypes: ["image"] as chrome.declarativeNetRequest.ResourceType[]
            }
          }
        ],
        removeRuleIds: [ruleId]
      }),
    { ruleId: PROBE_RULE_ID, path: PROBE_PATH }
  )
}

// A page that requests PROBE_PATH; if the DNR redirect to the extension's
// bundled pixel resolves, the image loads with a real intrinsic size.
const PROBE_HTML = `<!DOCTYPE html>
<html><head><title>WAR probe</title></head>
<body><img id="probe" src="${PROBE_PATH}" alt="probe"></body></html>`

test("shim DNR redirect to a web_accessible resource still resolves with use_dynamic_url enabled", async () => {
  await withExtensionContext("war-dynamic-url", async (context, worker) => {
    await installProbeRedirect(worker)

    const server = http.createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" })
      response.end(PROBE_HTML)
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("no port")
    const baseUrl = `http://127.0.0.1:${address.port}`

    try {
      const page = await context.newPage()
      await page.goto(`${baseUrl}/`)

      // The extension's own redirect to /shims/pixel.gif must still deliver the
      // resource — the page-safe shim feature depends on this, and it is the
      // half of use_dynamic_url that could regress.
      await expect
        .poll(
          async () =>
            page.evaluate(() => {
              const img = document.getElementById("probe") as HTMLImageElement | null
              return Boolean(img && img.complete && img.naturalWidth > 0)
            }),
          { timeout: 15_000 }
        )
        .toBe(true)
    } finally {
      server.closeIdleConnections?.()
      server.closeAllConnections?.()
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    }
  })
})
