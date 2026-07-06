#!/usr/bin/env node
/**
 * Harvest observed-but-unclassified third-party hosts across real pages.
 *
 * This is the input generator for the breadth backlog: it drives the built
 * extension across ad-heavy sites, reads the persisted SiteSummaries, and keeps
 * only third-party events with NO tracker/company name — the parties the DB
 * cannot yet name. The output ([{status:"unclassified", host}]) is the shape
 * `breadth-backlog.mjs --observed` consumes, so real browser sightings rank the
 * backlog instead of registry noise.
 *
 * Requires a build (build/chrome-mv3-prod) and runs HEADED — Chromium does not
 * load an MV3 extension in headless mode.
 *
 * Usage:
 *   node scripts/harvest-unclassified.mjs [options]
 *   --out <path>     output file (default intelligence/observed/unclassified-hosts.json)
 *   --site <url>     a site to visit; repeatable (replaces the default set)
 *   --sites <file>   newline-separated URLs to visit
 *   --dwell <ms>     how long to let each page run (default 9000)
 *   --merge          union with hosts already in --out instead of overwriting
 *   --help
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { chromium } from "@playwright/test"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const EXT = resolve(ROOT, "build/chrome-mv3-prod")
const DEFAULT_OUT = resolve(ROOT, "intelligence/observed/unclassified-hosts.json")
const DEFAULT_SITES = [
  "https://www.cnn.com",
  "https://www.tomsguide.com/news/what-is-todays-wordle-answer",
  "https://www.weather.com",
  "https://www.forbes.com",
  "https://www.cnet.com"
]

function parseArgs(argv) {
  const options = { out: DEFAULT_OUT, sites: [], dwell: 9000, merge: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--help" || arg === "-h") {
      console.log(
        [
          "Harvest observed-but-unclassified third-party hosts for the breadth backlog.",
          "Requires a build (pnpm build:chrome) and runs HEADED (MV3 needs a headed browser).",
          "",
          "  --out <path>    output file (default intelligence/observed/unclassified-hosts.json)",
          "  --site <url>    a site to visit; repeatable (replaces the default set)",
          "  --sites <file>  newline-separated URLs to visit",
          "  --dwell <ms>    how long to let each page run (default 9000)",
          "  --merge         union with hosts already in --out instead of overwriting",
          "  --help"
        ].join("\n")
      )
      process.exit(0)
    } else if (arg === "--out") options.out = resolve(argv[(i += 1)])
    else if (arg === "--dwell") options.dwell = Number(argv[(i += 1)])
    else if (arg === "--merge") options.merge = true
    else if (arg === "--site") options.sites.push(argv[(i += 1)])
    else if (arg === "--sites") {
      const file = argv[(i += 1)]
      options.sites.push(...readFileSync(file, "utf8").split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#")))
    } else throw new Error(`Unknown argument ${arg}`)
  }
  if (options.sites.length === 0) options.sites = DEFAULT_SITES
  if (!Number.isFinite(options.dwell) || options.dwell < 0) throw new Error("--dwell must be a non-negative number")
  return options
}

function hostForEvent(event) {
  const details = event.details
  if (details && typeof details.host === "string") return details.host
  if (details && typeof details.url === "string") {
    try {
      return new URL(details.url).hostname
    } catch {
      /* fall through */
    }
  }
  try {
    return new URL(event.origin).hostname
  } catch {
    return null
  }
}

// A third party the DB cannot name: not first-party, active, and carrying
// neither a company nor tracker id.
function isUnclassifiedThirdParty(event) {
  return !event.firstParty && event.status === "active" && !event.companyId && !event.trackerId
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (!existsSync(EXT)) {
    console.error(`No extension build at ${EXT}. Run: pnpm build:chrome`)
    process.exit(1)
  }

  const profileDir = resolve(ROOT, ".plasmo/harvest-profile")
  const context = await chromium.launchPersistentContext(profileDir, {
    // Headed is required: Chromium does not activate an MV3 extension headless.
    headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    viewport: { width: 1280, height: 900 }
  })

  const isExt = (candidate) => candidate.url().startsWith("chrome-extension://")
  let worker = context.serviceWorkers().find(isExt) ?? null

  for (const [index, site] of options.sites.entries()) {
    const page = await context.newPage()
    try {
      await page.goto(site, { waitUntil: "domcontentloaded", timeout: 45000 })
      await page.waitForTimeout(options.dwell)
    } catch (error) {
      console.error(`skip ${site}: ${error?.message ?? error}`)
    }
    await page.close().catch(() => undefined)
    // The MV3 worker registers lazily on first navigation.
    if (index === 0 && !worker) {
      worker = context.serviceWorkers().find(isExt) ?? (await context.waitForEvent("serviceworker", { predicate: isExt, timeout: 30000 }).catch(() => null))
    }
  }
  worker ??= context.serviceWorkers().find(isExt)
  if (!worker) {
    await context.close()
    throw new Error("extension service worker never registered — is the build current?")
  }

  // Read summaries from an extension page (stable chrome.storage; the worker
  // may be idle and unevaluable).
  const extId = new URL(worker.url()).host
  const extPage = await context.newPage()
  await extPage.goto(`chrome-extension://${extId}/popup.html`)
  const summaries = await extPage.evaluate(async () => (await chrome.storage.local.get(["siteSummaries"])).siteSummaries ?? {})
  await context.close()

  const hosts = new Set()
  for (const summary of Object.values(summaries)) {
    for (const event of summary.events ?? []) {
      if (!isUnclassifiedThirdParty(event)) continue
      const host = hostForEvent(event)
      if (host && host.includes(".")) hosts.add(host.replace(/^www\./, ""))
    }
  }

  if (options.merge && existsSync(options.out)) {
    for (const entry of JSON.parse(readFileSync(options.out, "utf8"))) {
      if (entry?.host) hosts.add(String(entry.host).replace(/^www\./, ""))
    }
  }

  const observed = [...hosts].sort().map((host) => ({ status: "unclassified", host }))
  mkdirSync(dirname(options.out), { recursive: true })
  writeFileSync(options.out, `${JSON.stringify(observed, null, 2)}\n`)
  console.log(`harvested ${observed.length} unclassified host(s) from ${Object.keys(summaries).length} summaries across ${options.sites.length} site(s) -> ${options.out}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
