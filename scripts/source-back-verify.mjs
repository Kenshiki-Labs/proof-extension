#!/usr/bin/env node
/**
 * Deterministic source-backing loop for seed tracker records.
 *
 * No model, no permission prompts: for each seed tracker it fetches candidate
 * vendor policy URLs with a plain Node fetch, and accepts one ONLY when the
 * page (a) loads, (b) is on a plausibly-vendor host, and (c) reads like a real
 * privacy/data policy. A verified page yields a `vendor_docs` source with a
 * real retrieved_at and a real excerpt quoted from what was actually fetched,
 * and flips the record to source_backed. A URL that 404s, redirects off-vendor,
 * or lacks policy signal is rejected — the record stays seed and the reason is
 * reported. Provenance is never written that this run did not itself confirm.
 *
 * The candidate URLs below are canonical best-guesses; wrong ones fail safely.
 * The same shape accepts model-proposed URLs later (the finder agent) — the
 * trust boundary is this deterministic verification, not who proposed the URL.
 *
 * Usage: node scripts/source-back-verify.mjs [--write]
 *   dry run without --write (reports pass/fail per record, no mutation).
 */
import { readFileSync, writeFileSync } from "node:fs"

const TRACKERS_PATH = new URL("../src/core/db/trackers.json", import.meta.url)
const REVIEWER = "pulse-source-loop-v1 (deterministic fetch + verify)"
const TODAY = new Date().toISOString().slice(0, 10)
const FETCH_TIMEOUT_MS = 20_000

// trackerId -> ordered candidate official policy URLs. First that verifies wins.
const CANDIDATES = {
  "tiktok-pixel": ["https://ads.tiktok.com/i18n/official/policy/privacy", "https://www.tiktok.com/legal/page/global/privacy-policy/en"],
  hotjar: ["https://www.hotjar.com/legal/policies/privacy/"],
  criteo: ["https://www.criteo.com/privacy/"],
  optimizely: ["https://www.optimizely.com/legal/privacy-policy/", "https://www.optimizely.com/privacy/"],
  crazyegg: ["https://www.crazyegg.com/privacy", "https://www.crazyegg.com/privacy/"],
  quantcast: ["https://www.quantcast.com/privacy/"],
  taboola: ["https://www.taboola.com/policies/privacy-policy", "https://www.taboola.com/privacy-policy"],
  outbrain: ["https://www.outbrain.com/legal/privacy", "https://www.outbrain.com/privacy/"],
  "the-trade-desk": ["https://www.thetradedesk.com/us/privacy", "https://www.thetradedesk.com/us/privacy-policy"],
  pubmatic: ["https://pubmatic.com/legal/privacy-policy/", "https://pubmatic.com/privacy-policy/"],
  magnite: ["https://www.magnite.com/legal/platform-privacy-policy/", "https://www.magnite.com/privacy-policy/"],
  openx: ["https://www.openx.com/privacy-center/privacy-policy/", "https://www.openx.com/legal/privacy-policy/"],
  "index-exchange": ["https://www.indexexchange.com/privacy/", "https://www.indexexchange.com/legal/"],
  lotame: ["https://www.lotame.com/about-lotame/privacy/", "https://www.lotame.com/privacy/"],
  liveramp: ["https://liveramp.com/privacy/", "https://liveramp.com/service-privacy-policy/"],
  id5: ["https://id5.io/platform-privacy-policy/", "https://id5.io/privacy/"],
  "33across": ["https://33across.com/privacy-policy/", "https://www.33across.com/privacy-policy/"],
  tapad: ["https://www.tapad.com/privacy", "https://www.tapad.com/privacy-policy"],
  "6sense": ["https://6sense.com/privacy-policy/", "https://6sense.com/legal/privacy-policy/"],
  "amazon-ads": ["https://www.amazon.com/gp/help/customer/display.html?nodeId=GX7NJQ4ZB2D2R5", "https://advertising.amazon.com/legal/privacy-notice"],
}

// Signal words a genuine consumer privacy/data policy reliably contains. Two or
// more distinct hits + a vendor-identity signal = a real policy, not a 404 or
// a marketing page.
const POLICY_SIGNALS = ["privacy", "personal data", "personal information", "cookie", "information we collect", "data we collect", "data protection", "how we use"]

const doWrite = process.argv.includes("--write")

function htmlToText(html) {
  return String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/gi, '"')
    .replace(/&mdash;/gi, "-")
    .replace(/\s+/g, " ")
    .trim()
}

function registrable(host) {
  const parts = host.toLowerCase().split(".").filter(Boolean)
  return parts.length <= 2 ? parts.join(".") : parts.slice(-2).join(".")
}

function identityTokens(record) {
  return [record.companyId, record.id, ...(record.displayName ?? "").toLowerCase().split(/\s+/)]
    .filter(Boolean)
    .map((token) => token.replace(/[^a-z0-9]/gi, "").toLowerCase())
    .filter((token) => token.length >= 3)
}

function hostIsPlausible(finalUrl, record) {
  let host
  try {
    host = new URL(finalUrl).hostname
  } catch {
    return false
  }
  const recordRegs = new Set((record.match?.domains ?? []).map((domain) => registrable(domain)))
  if (recordRegs.has(registrable(host))) return true
  const flatHost = host.replace(/[^a-z0-9]/gi, "").toLowerCase()
  return identityTokens(record).some((token) => flatHost.includes(token))
}

async function fetchText(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    // A standard browser UA: several vendors' WAFs 403 a bot UA even for their
    // public policy pages. We only ever fetch public legal documents (never
    // auth, never paywalls) so presenting a normal browser is appropriate.
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
    })
    if (!res.ok) return { error: `http_${res.status}` }
    return { finalUrl: res.url || url, text: htmlToText(await res.text()) }
  } catch (error) {
    return { error: error?.name === "AbortError" ? "timeout" : "fetch_failed" }
  } finally {
    clearTimeout(timer)
  }
}

// A short real excerpt around a policy keyword, stored as provenance so the
// transform_notes quotes text that was actually on the fetched page.
function excerptAround(text) {
  const lower = text.toLowerCase()
  for (const keyword of ["information we collect", "personal data", "personal information", "data we collect", "we collect"]) {
    const at = lower.indexOf(keyword)
    if (at >= 0) return text.slice(at, at + 180).trim()
  }
  return text.slice(0, 180).trim()
}

const trackersFile = JSON.parse(readFileSync(TRACKERS_PATH, "utf8"))
const list = Array.isArray(trackersFile.trackers) ? trackersFile.trackers : trackersFile
const byId = new Map(list.map((record) => [record.id, record]))

let flipped = 0
const report = []

for (const [trackerId, urls] of Object.entries(CANDIDATES)) {
  const record = byId.get(trackerId)
  if (!record) {
    report.push(`SKIP  ${trackerId} — no such record`)
    continue
  }
  if (record.review?.status !== "seed") {
    report.push(`SKIP  ${trackerId} — already ${record.review?.status}`)
    continue
  }

  let done = false
  for (const url of urls) {
    const fetched = await fetchText(url)
    if (fetched.error) {
      report.push(`  try ${trackerId}: ${url} → ${fetched.error}`)
      continue
    }
    if (!hostIsPlausible(fetched.finalUrl, record)) {
      report.push(`  try ${trackerId}: off-vendor host ${new URL(fetched.finalUrl).hostname}`)
      continue
    }
    const lower = fetched.text.toLowerCase()
    const hits = POLICY_SIGNALS.filter((signal) => lower.includes(signal))
    const hasIdentity = identityTokens(record).some((token) => lower.includes(token))
    if (hits.length < 2 || !hasIdentity) {
      report.push(`  try ${trackerId}: not policy-like (signals=${hits.length}, identity=${hasIdentity})`)
      continue
    }

    report.push(`PASS  ${trackerId} — ${hits.length} policy signals @ ${new URL(fetched.finalUrl).hostname}`)
    if (doWrite) {
      record.sources = [
        ...(record.sources ?? []),
        {
          family: "vendor_docs",
          name: `${record.displayName} privacy policy`,
          url: fetched.finalUrl,
          retrieved_at: TODAY,
          license: "Vendor public documentation; referenced, not reproduced",
          transform_notes: `Retrieved and confirmed as the vendor's own privacy policy on ${TODAY} (${hits.length} policy signals, vendor identity present). Excerpt: "${excerptAround(fetched.text)}"`,
        },
      ]
      record.review = {
        status: "source_backed",
        last_reviewed_at: TODAY,
        reviewer: REVIEWER,
        notes: `Source-backed by deterministic fetch+verify against ${new URL(fetched.finalUrl).hostname} on ${TODAY}. Pending human spot-check.`,
      }
      flipped += 1
    }
    done = true
    break
  }
  if (!done) report.push(`FAIL  ${trackerId} — no candidate URL verified`)
}

console.log(report.join("\n"))
const passes = report.filter((line) => line.startsWith("PASS")).length
console.log(`\n${passes} verified, ${flipped} flipped${doWrite ? "" : " (dry run — pass --write to apply)"}`)

if (doWrite && flipped > 0) {
  writeFileSync(TRACKERS_PATH, `${JSON.stringify(trackersFile, null, 2)}\n`)
  console.log(`Wrote trackers.json. Next: pnpm vitest run src/core/db && pnpm db:baseline`)
}
