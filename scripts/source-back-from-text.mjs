#!/usr/bin/env node
/**
 * Source-back seed trackers from owner-pasted policy text.
 *
 * For vendors no automated fetch can reach (hard Cloudflare challenges), the
 * operator pastes the real policy into intelligence/manual-policy-text/<id>.txt
 * (line 1 = source URL, lines 2+ = the text). This script verifies the paste
 * the same way the fetch gates do — it must carry >=2 policy signals and the
 * vendor's own identity — then writes a vendor_docs source with the URL, a real
 * retrieved_at, and a short excerpt (referenced, not reproduced) and flips the
 * record to source_backed. A wrong or empty paste fails safely; nothing is
 * written that the text does not support.
 *
 * Usage: node scripts/source-back-from-text.mjs [--write]
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs"

const TRACKERS_PATH = new URL("../src/core/db/trackers.json", import.meta.url)
const DROP_DIR = new URL("../intelligence/manual-policy-text/", import.meta.url)
const REVIEWER = "pulse-source-loop-v1 (owner-provided policy text, verified)"
const TODAY = new Date().toISOString().slice(0, 10)
const doWrite = process.argv.includes("--write")

const POLICY_SIGNALS = ["privacy", "personal data", "personal information", "cookie", "information we collect", "data we collect", "data protection", "how we use", "we collect"]

function registrable(host) {
  const parts = host.toLowerCase().split(".").filter(Boolean)
  return parts.length <= 2 ? parts.join(".") : parts.slice(-2).join(".")
}
function identityTokens(record) {
  return [record.companyId, record.id, ...(record.displayName ?? "").toLowerCase().split(/\s+/)]
    .filter(Boolean).map((t) => t.replace(/[^a-z0-9]/gi, "").toLowerCase()).filter((t) => t.length >= 3)
}
function hostIsPlausible(url, record) {
  let host
  try { host = new URL(url).hostname } catch { return false }
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

const files = readdirSync(DROP_DIR).filter((f) => f.endsWith(".txt"))
if (files.length === 0) {
  console.log("No .txt drops in intelligence/manual-policy-text/. See its README for the format.")
  process.exit(0)
}

let flipped = 0
const report = []

for (const file of files) {
  const trackerId = file.replace(/\.txt$/, "")
  const record = byId.get(trackerId)
  if (!record) { report.push(`SKIP  ${file} — no tracker "${trackerId}"`); continue }
  if (record.review?.status !== "seed") { report.push(`SKIP  ${trackerId} — already ${record.review?.status}`); continue }

  const raw = readFileSync(new URL(file, DROP_DIR), "utf8")
  const newlineAt = raw.indexOf("\n")
  const url = (newlineAt === -1 ? raw : raw.slice(0, newlineAt)).trim()
  const text = (newlineAt === -1 ? "" : raw.slice(newlineAt + 1)).replace(/\s+/g, " ").trim()

  if (!/^https?:\/\//i.test(url)) { report.push(`FAIL  ${trackerId} — line 1 is not a URL`); continue }
  if (!hostIsPlausible(url, record)) { report.push(`FAIL  ${trackerId} — URL host not plausibly ${record.displayName}`); continue }
  if (text.length < 400) { report.push(`FAIL  ${trackerId} — pasted text too short (${text.length})`); continue }
  const lower = text.toLowerCase()
  const hits = POLICY_SIGNALS.filter((s) => lower.includes(s))
  const hasIdentity = identityTokens(record).some((t) => lower.includes(t))
  if (hits.length < 2 || !hasIdentity) { report.push(`FAIL  ${trackerId} — not policy-like (signals=${hits.length}, identity=${hasIdentity})`); continue }

  report.push(`PASS  ${trackerId} — ${hits.length} signals, ${text.length} chars, ${new URL(url).hostname}`)
  if (doWrite) {
    record.sources = [...(record.sources ?? []), {
      family: "vendor_docs",
      name: `${record.displayName} privacy policy`,
      url,
      retrieved_at: TODAY,
      license: "Vendor public documentation; referenced, not reproduced",
      transform_notes: `Owner-provided policy text from ${url}, verified on ${TODAY} to carry ${hits.length} policy signals and vendor identity. Excerpt: "${excerptAround(text)}"`,
    }]
    record.review = { status: "source_backed", last_reviewed_at: TODAY, reviewer: REVIEWER, notes: `Source-backed from owner-provided policy text (${new URL(url).hostname}) on ${TODAY}. Pending human spot-check.` }
    flipped += 1
  }
}

console.log(report.join("\n"))
console.log(`\n${report.filter((l) => l.startsWith("PASS")).length} verified, ${flipped} flipped${doWrite ? "" : " (dry run — pass --write to apply)"}`)
if (doWrite && flipped > 0) {
  writeFileSync(TRACKERS_PATH, `${JSON.stringify(trackersFile, null, 2)}\n`)
  console.log("Wrote trackers.json. Next: pnpm vitest run src/core/db && pnpm db:baseline")
}
