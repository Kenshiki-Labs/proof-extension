import { chromium, expect, type BrowserContext, type Worker } from "@playwright/test"
import { rm } from "node:fs/promises"
import http from "node:http"
import path from "node:path"

import { MAIN_WORLD_SCRIPT_ID } from "../../src/core/domain/constants"
import type { ObserverEvent } from "../../src/core/domain/types"

/**
 * The MV3 service worker registers its webRequest observer and content
 * scripts during startup. On a cold persistent context that startup races
 * the first page load — a tracker request that fires once at load would be
 * missed if we navigate too early. Gate on content-script registration
 * (same lifecycle point) so every test starts from a ready observer.
 */
export async function waitForObserverReady(worker: Worker) {
  await expect
    .poll(
      () =>
        worker.evaluate(async (scriptId) => {
          const scripts = await chrome.scripting.getRegisteredContentScripts({ ids: [scriptId] })
          return scripts.length
        }, MAIN_WORLD_SCRIPT_ID),
      { timeout: 15_000 }
    )
    .toBe(1)
}

/**
 * Ephemeral-port HTTP server for fixture pages. Pass a single HTML string
 * for a one-page server, or a map of path -> HTML for multiple routes.
 */
export async function withFixtureServer(
  pages: string | Record<string, string>,
  run: (baseUrl: string) => Promise<void>
) {
  const routes: Record<string, string> = typeof pages === "string" ? { "/": pages } : pages

  const server = http.createServer((request, response) => {
    const html = routes[new URL(request.url ?? "/", "http://localhost").pathname]
    if (html === undefined) {
      response.writeHead(404).end()
      return
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" })
    response.end(html)
  })

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Fixture server did not expose a port")

  try {
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    server.closeIdleConnections?.()
    server.closeAllConnections?.()
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  }
}

/** Launches the built extension in a fresh persistent context. */
export async function withExtensionContext(
  profileName: string,
  run: (context: BrowserContext, worker: Worker, extensionId: string) => Promise<void>
) {
  const extensionPath = path.resolve("build/chrome-mv3-prod")
  const userDataDir = path.resolve(`.playwright/user-data/${profileName}`)
  await rm(userDataDir, { force: true, recursive: true })

  const context = await chromium.launchPersistentContext(userDataDir, {
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    headless: false
  })

  try {
    let [serviceWorker] = context.serviceWorkers()
    serviceWorker ??= await context.waitForEvent("serviceworker")
    const extensionId = serviceWorker.url().split("/")[2]
    if (!extensionId) throw new Error("Could not resolve extension id from service worker URL")
    await waitForObserverReady(serviceWorker)
    await run(context, serviceWorker, extensionId)
  } finally {
    await context.close()
  }
}

export const TRACKER_HOSTS = /(connect\.facebook\.net|facebook\.com|google-analytics\.com|googletagmanager\.com|doubleclick\.net|googleadservices\.com|googlesyndication\.com|fullstory\.com)/

/**
 * Intercepts all tracker-host requests and fulfills them locally so no real
 * tracker traffic ever leaves the machine (tests run offline). Interception
 * happens after DNR — a blocked request never reaches the handler — so the
 * returned per-host hit counter doubles as network-level proof of blocking.
 */
export async function stubTrackerRoutes(context: BrowserContext) {
  const hits = new Map<string, number>()

  await context.route(TRACKER_HOSTS, (route) => {
    const host = new URL(route.request().url()).hostname
    hits.set(host, (hits.get(host) ?? 0) + 1)
    const isScript = route.request().resourceType() === "script"
    route
      .fulfill({
        body: isScript ? "/* proof-e2e tracker stub */" : "",
        contentType: isScript ? "application/javascript" : "text/plain",
        status: 200
      })
      .catch(() => undefined)
  })

  return {
    hitCount(host: string) {
      return hits.get(host) ?? 0
    },
    totalHits() {
      return [...hits.values()].reduce((sum, count) => sum + count, 0)
    }
  }
}

/**
 * Page exercising the three Phase 1 acceptance vendors through their real
 * hostnames and DB-matched paths (script, image, and fetch request types).
 */
export const TRACKER_FIXTURE_HTML = `
  <h1>Tracker fixture</h1>
  <script>
    addEventListener("DOMContentLoaded", () => {
      const meta = new Image(); meta.src = "https://www.facebook.com/tr?id=1";
      const ads = new Image(); ads.src = "https://doubleclick.net/pagead/viewthroughconversion/1";
      fetch("https://www.facebook.com/tr?id=1", { mode: "no-cors" }).catch(() => undefined)
      fetch("https://www.google-analytics.com/g/collect?v=2", { mode: "no-cors" }).catch(() => undefined)
      fetch("https://googleadservices.com/pagead/conversion/1", { mode: "no-cors" }).catch(() => undefined)
      fetch("https://fullstory.com/rec/page", { mode: "no-cors" }).catch(() => undefined)
    })
  </script>
`

/** Plain page with no tracker references. */
export const PLAIN_FIXTURE_HTML = `
  <h1>Plain fixture</h1>
  <p>No trackers here.</p>
`

/** Meta Pixel fixture with deterministic beacon surfaces. */
export const META_PIXEL_FIXTURE_HTML = `
  <h1>Meta Pixel fixture</h1>
  <script>
    addEventListener("DOMContentLoaded", () => {
      const pixel = new Image(); pixel.src = "https://www.facebook.com/tr?id=1";
      fetch("https://www.facebook.com/tr?id=1", { mode: "no-cors" }).catch(() => undefined)
    })
  </script>
`

/** Google Analytics and Google Ads fixture with deterministic beacon surfaces. */
export const GOOGLE_ANALYTICS_ADS_FIXTURE_HTML = `
  <h1>Google Analytics and Ads fixture</h1>
  <script>
    addEventListener("DOMContentLoaded", () => {
      const ads = new Image(); ads.src = "https://doubleclick.net/pagead/viewthroughconversion/1";
      fetch("https://www.google-analytics.com/g/collect?v=2", { mode: "no-cors" }).catch(() => undefined)
      fetch("https://googleadservices.com/pagead/conversion/1", { mode: "no-cors" }).catch(() => undefined)
    })
  </script>
`

/** FullStory fixture with deterministic ingest surfaces. */
export const FULLSTORY_FIXTURE_HTML = `
  <h1>FullStory fixture</h1>
  <script>
    addEventListener("DOMContentLoaded", () => {
      fetch("https://fullstory.com/rec/page", { mode: "no-cors" }).catch(() => undefined)
    })
  </script>
`

/**
 * Page that defines vendor SDK globals without any network request —
 * simulates a cached, proxied, or CNAME-cloaked tracker whose only
 * browser-visible trace is its main-world global. Also defines a
 * non-signature global to assert nothing is invented for it.
 */
export const SDK_GLOBAL_FIXTURE_HTML = `
  <h1>SDK global fixture</h1>
  <script>
    window.fbq = function () {};
    window.FS = { identify: function () {} };
    window.myOwnAppGlobal = { notATracker: true };
  </script>
`

/** First-party fixture used to assert extension-run passive exposure scan events. */
export const FIRST_PARTY_EXPOSURE_FIXTURE_HTML = `
  <h1>First-party exposure fixture</h1>
  <p>Passive browser surface fields should be reported by the extension as extension-scan evidence.</p>
`

/**
 * Page that dynamically injects the FullStory script after load —
 * exercises the dom-watch MutationObserver and the background's
 * tracker-DB join on the injected src.
 */
export const INJECTOR_FIXTURE_HTML = `
  <h1>Injector fixture</h1>
  <script>
    addEventListener("DOMContentLoaded", () => {
      setTimeout(() => {
        const script = document.createElement("script")
        script.src = "https://edge.fullstory.com/s/fs.js"
        document.head.appendChild(script)
      }, 200)
    })
  </script>
`

type StoredSummary = {
  origin?: string
  activeCompanies?: string[]
  blockedCompanies?: string[]
  events?: ObserverEvent[]
}

/** Reads all per-tab summaries from the extension's local storage. */
export function readSummaries(worker: Worker): Promise<StoredSummary[]> {
  return worker.evaluate(async () => {
    const stored = await chrome.storage.local.get("siteSummaries")
    return Object.values(stored.siteSummaries ?? {})
  }) as Promise<StoredSummary[]>
}

/** All events across all tab summaries. */
export async function readAllEvents(worker: Worker): Promise<ObserverEvent[]> {
  const summaries = await readSummaries(worker)
  return summaries.flatMap((summary) => summary.events ?? [])
}
