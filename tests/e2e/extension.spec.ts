import { chromium, expect, test } from "@playwright/test"
import { rm } from "node:fs/promises"
import http from "node:http"
import path from "node:path"

import { MAIN_WORLD_SCRIPT_ID } from "../../src/core/domain/constants"

async function withFixtureServer(html: string, run: (url: string) => Promise<void>) {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" })
    response.end(html)
  })

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Fixture server did not expose a port")

  try {
    await run(`http://127.0.0.1:${address.port}/`)
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  }
}

test("loads the built Chromium extension popup", async () => {
  const extensionPath = path.resolve("build/chrome-mv3-prod")
  const userDataDir = path.resolve(".playwright/user-data/chromium-extension")
  await rm(userDataDir, { force: true, recursive: true })

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

test("records canvas reads from page scripts", async () => {
  const extensionPath = path.resolve("build/chrome-mv3-prod")
  const userDataDir = path.resolve(".playwright/user-data/chromium-canvas")
  await rm(userDataDir, { force: true, recursive: true })

  const context = await chromium.launchPersistentContext(userDataDir, {
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    headless: false
  })

  try {
    let [serviceWorker] = context.serviceWorkers()
    serviceWorker ??= await context.waitForEvent("serviceworker")
    const worker = serviceWorker

    const page = await context.newPage()
    await expect
      .poll(async () => {
        return await worker.evaluate(async (scriptId) => {
          const scripts = await chrome.scripting.getRegisteredContentScripts({ ids: [scriptId] })
          return scripts.length
        }, MAIN_WORLD_SCRIPT_ID)
      })
      .toBe(1)

    await withFixtureServer(
      `
        <canvas id="fingerprint" width="16" height="16" style="display: none"></canvas>
        <script>
          const canvas = document.getElementById("fingerprint")
          const ctx = canvas.getContext("2d")
          ctx.fillText("proof", 1, 12)
          canvas.toDataURL()
        </script>
      `,
      async (url) => {
        await page.goto(url)
      }
    )

    await expect
      .poll(async () => {
        return await worker.evaluate(async () => {
          const stored = await chrome.storage.local.get("siteSummaries")
          const summaries = Object.values(stored.siteSummaries ?? {}) as Array<{ events?: Array<{ eventType: string }> }>
          return summaries.reduce(
            (count, summary) => count + (summary.events?.filter((event) => event.eventType === "canvas_read").length ?? 0),
            0
          )
        })
      })
      .toBe(1)
  } finally {
    await context.close()
  }
})