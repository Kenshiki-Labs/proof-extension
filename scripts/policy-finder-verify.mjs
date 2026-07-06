#!/usr/bin/env node
/**
 * Deterministic gate for the policy-finder loop.
 *
 * The Haiku finder loop only SEARCHES: per record it returns candidate policy
 * URLs picked from web-search results. This script is the trust boundary — it
 * fetches each proposed URL with a plain Node fetch (no prompts) and keeps a
 * URL only when it (a) loads, (b) sits on a plausibly-vendor host, and (c)
 * reads like a real privacy/terms/cookie document. Output is a verified
 * key -> {privacy,cookie,terms} map: a discovery fallback the Contract view can
 * use when a page's own anchors yield nothing, and candidate URLs for the
 * source-backing holdouts. Never records a URL this run did not confirm.
 *
 * Usage: node scripts/policy-finder-verify.mjs <candidates.json> [--out <file>]
 * candidates.json: [{ key, label, domains:[], privacyUrl, cookieUrl, termsUrl }]
 */
import { readFileSync, writeFileSync } from "node:fs"

const FETCH_TIMEOUT_MS = 20_000
const DOC_SIGNALS = {
  privacy: ["privacy", "personal data", "personal information", "information we collect", "data we collect", "how we use"],
  cookie: ["cookie", "tracking technolog", "consent", "your choices"],
  terms: ["terms", "agreement", "you agree", "arbitration", "liability"],
}

const candidatesPath = process.argv[2]
const outIndex = process.argv.indexOf("--out")
const outPath = outIndex !== -1 ? process.argv[outIndex + 1] : null
if (!candidatesPath) {
  console.error("usage: node scripts/policy-finder-verify.mjs <candidates.json> [--out <file>]")
  process.exit(2)
}

function htmlToText(html) {
  return String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

function registrable(host) {
  const parts = host.toLowerCase().split(".").filter(Boolean)
  return parts.length <= 2 ? parts.join(".") : parts.slice(-2).join(".")
}

function identityTokens(record) {
  return [record.key, ...(record.label ?? "").toLowerCase().split(/\s+/), ...(record.domains ?? [])]
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
  const recordRegs = new Set((record.domains ?? []).map((domain) => registrable(domain)))
  if (recordRegs.has(registrable(host))) return true
  const flatHost = host.replace(/[^a-z0-9]/gi, "").toLowerCase()
  return identityTokens(record).some((token) => flatHost.includes(token))
}

async function fetchText(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
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

async function verifyOne(url, kind, record) {
  if (!url) return { ok: false, reason: "none proposed" }
  const fetched = await fetchText(url)
  if (fetched.error) return { ok: false, reason: fetched.error }
  if (!hostIsPlausible(fetched.finalUrl, record)) return { ok: false, reason: `off-vendor ${new URL(fetched.finalUrl).hostname}` }
  const hits = DOC_SIGNALS[kind].filter((signal) => fetched.text.includes(signal))
  if (hits.length < 2) return { ok: false, reason: `not ${kind}-like (${hits.length})` }
  return { ok: true, url: fetched.finalUrl, signals: hits.length }
}

const candidates = JSON.parse(readFileSync(candidatesPath, "utf8"))
const verified = {}
const report = []

for (const record of candidates) {
  const entry = {}
  for (const kind of ["privacy", "cookie", "terms"]) {
    const result = await verifyOne(record[`${kind}Url`], kind, record)
    if (result.ok) {
      entry[kind] = result.url
      report.push(`  PASS ${record.key} ${kind} @ ${new URL(result.url).hostname} (${result.signals})`)
    } else if (record[`${kind}Url`]) {
      report.push(`  drop ${record.key} ${kind}: ${result.reason}`)
    }
  }
  if (Object.keys(entry).length > 0) {
    verified[record.key] = { label: record.label, ...entry }
    report.push(`OK   ${record.key} — ${Object.keys(entry).join(", ")}`)
  } else {
    report.push(`MISS ${record.key} — no verifiable policy URL`)
  }
}

console.log(report.join("\n"))
console.log(`\n${Object.keys(verified).length}/${candidates.length} records with >=1 verified policy URL`)

if (outPath) {
  writeFileSync(outPath, `${JSON.stringify(verified, null, 2)}\n`)
  console.log(`Wrote ${outPath}`)
}
