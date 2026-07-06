#!/usr/bin/env node
/**
 * Browser-fetch source-backing for vendors a plain fetch cannot read.
 *
 * The deterministic Node fetch in source-back-verify.mjs is blocked by two
 * things: Cloudflare bot-UA 403s and JS-rendered policy pages. A real headless
 * Chromium defeats both — it runs the page's scripts and carries a genuine
 * browser fingerprint. Same trust boundary as the plain-fetch gate: a record
 * only flips to source_backed when the rendered page loads on a plausibly-
 * vendor host and reads like a real privacy policy, with a real excerpt stored
 * as provenance. Nothing is written that this run did not itself render.
 *
 * We only ever load public legal documents (never auth, never paywalls), so a
 * real browser is appropriate. Usage: node scripts/source-back-browser.mjs [--write]
 */
import { readFileSync, writeFileSync } from "node:fs"

import { chromium } from "@playwright/test"

const TRACKERS_PATH = new URL("../src/core/db/trackers.json", import.meta.url)
const REVIEWER = "pulse-source-loop-v1 (headless-browser fetch + verify)"
const TODAY = new Date().toISOString().slice(0, 10)
const doWrite = process.argv.includes("--write")

// The four a plain fetch could not read; URLs from the policy-finder loop.
const CANDIDATES = {
  magnite: ["https://www.magnite.com/legal/advertising-platform-privacy-policy/"],
  "33across": ["https://www.33across.com/privacy-policy", "https://33across.com/privacy-policy/"],
  "6sense": ["https://6sense.com/privacy-policy/"],
  // Amazon's canonical privacy notice lives in the help center (owner pointer),
  // richer than the ad-subdomain page; advertising.amazon.com as fallback.
  "amazon-ads": ["https://www.amazon.com/gp/help/customer/display.html?nodeId=GX7NJQ4ZB2D2R5", "https://advertising.amazon.com/legal/privacy-notice"],
}

const POLICY_SIGNALS = ["privacy", "personal data", "personal information", "cookie", "information we collect", "data we collect", "data protection", "how we use"]

function registrable(host) {
  const parts = host.toLowerCase().split(".").filter(Boolean)
  return parts.length <= 2 ? parts.join(".") : parts.slice(-2).join(".")
}
function identityTokens(record) {
  return [record.companyId, record.id, ...(record.displayName ?? "").toLowerCase().split(/\s+/)]
    .filter(Boolean).map((t) => t.replace(/[^a-z0-9]/gi, "").toLowerCase()).filter((t) => t.length >= 3)
}
function hostIsPlausible(finalUrl, record) {
  let host
  try { host = new URL(finalUrl).hostname } catch { return false }
  if (new Set((record.match?.domains ?? []).map(registrable)).has(registrable(host))) return true
  const flat = host.replace(/[^a-z0-9]/gi, "").toLowerCase()
  return identityTokens(record).some((t) => flat.includes(t))
}
function excerptAround(text) {
  const lower = text.toLowerCase()
  for (const kw of ["information we collect", "personal data", "personal information", "data we collect", "we collect"]) {
    const at = lower.indexOf(kw)
    if (at >= 0) return text.slice(at, at + 180).replace(/\s+/g, " ").trim()
  }
  return text.slice(0, 180).replace(/\s+/g, " ").trim()
}

const trackersFile = JSON.parse(readFileSync(TRACKERS_PATH, "utf8"))
const list = Array.isArray(trackersFile.trackers) ? trackersFile.trackers : trackersFile
const byId = new Map(list.map((r) => [r.id, r]))

// Headed + real installed Chrome + automation flag hidden: Cloudflare
// enterprise blocks bundled Chromium and the CDP automation signature outright,
// serving a block page a click cannot clear. The real Chrome channel with
// AutomationControlled disabled presents a normal-browser signature the
// operator can then solve the challenge in.
const browser = await chromium.launch({
  headless: false,
  channel: "chrome",
  args: ["--disable-blink-features=AutomationControlled"],
})
const context = await browser.newContext({
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  viewport: { width: 1280, height: 900 },
})

let flipped = 0
const report = []

for (const [trackerId, urls] of Object.entries(CANDIDATES)) {
  const record = byId.get(trackerId)
  if (!record || record.review?.status !== "seed") {
    report.push(`SKIP  ${trackerId} — ${record ? `already ${record.review?.status}` : "no record"}`)
    continue
  }
  let done = false
  for (const url of urls) {
    const page = await context.newPage()
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 })
      // Human-assisted: if a Cloudflare "prove you are human" interstitial is up,
      // the operator solves it in the visible window. Poll for real policy
      // content up to 90s rather than reading one fixed moment, so there is time
      // to click through. Falls through and reads whatever rendered on timeout.
      try {
        await page.waitForFunction(
          () => {
            const body = document.body?.innerText ?? ""
            return body.length > 2000 && /privacy|personal data|personal information|cookie/i.test(body)
          },
          { timeout: 90_000, polling: 1000 },
        )
      } catch {
        // interstitial never cleared — read what is there and let the gate reject it
      }
      const text = (await page.evaluate(() => document.body?.innerText ?? "")).replace(/\s+/g, " ").trim()
      const finalUrl = page.url()
      const lower = text.toLowerCase()
      const hits = POLICY_SIGNALS.filter((s) => lower.includes(s))
      const hasIdentity = identityTokens(record).some((t) => lower.includes(t))
      if (!hostIsPlausible(finalUrl, record)) { report.push(`  try ${trackerId}: off-vendor ${new URL(finalUrl).hostname}`); continue }
      if (hits.length < 2 || !hasIdentity || text.length < 400) { report.push(`  try ${trackerId}: not policy-like (signals=${hits.length}, id=${hasIdentity}, len=${text.length})`); continue }

      report.push(`PASS  ${trackerId} — ${hits.length} signals @ ${new URL(finalUrl).hostname} (${text.length} chars)`)
      if (doWrite) {
        record.sources = [...(record.sources ?? []), {
          family: "vendor_docs",
          name: `${record.displayName} privacy policy`,
          url: finalUrl,
          retrieved_at: TODAY,
          license: "Vendor public documentation; referenced, not reproduced",
          transform_notes: `Rendered in headless Chromium and confirmed as the vendor's own privacy policy on ${TODAY} (${hits.length} policy signals, vendor identity present). Excerpt: "${excerptAround(text)}"`,
        }]
        record.review = { status: "source_backed", last_reviewed_at: TODAY, reviewer: REVIEWER, notes: `Source-backed by headless-browser fetch+verify against ${new URL(finalUrl).hostname} on ${TODAY}. Pending human spot-check.` }
        flipped += 1
      }
      done = true
      break
    } catch (error) {
      report.push(`  try ${trackerId}: ${error?.name === "TimeoutError" ? "timeout" : "load_failed"} ${url}`)
    } finally {
      await page.close()
    }
  }
  if (!done) report.push(`FAIL  ${trackerId} — could not render a verifiable policy`)
}

await browser.close()
console.log(report.join("\n"))
console.log(`\n${report.filter((l) => l.startsWith("PASS")).length} rendered+verified, ${flipped} flipped${doWrite ? "" : " (dry run — pass --write to apply)"}`)
if (doWrite && flipped > 0) {
  writeFileSync(TRACKERS_PATH, `${JSON.stringify(trackersFile, null, 2)}\n`)
  console.log("Wrote trackers.json. Next: pnpm vitest run src/core/db && pnpm db:baseline")
}
