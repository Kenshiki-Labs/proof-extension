// Renders docs/db-baseline.md from the tracker DB files and SDK signature
// table. The baseline is generated, never hand-edited — run `pnpm db:baseline`
// after any DB or signature change so the doc cannot drift from the data.
import { readFileSync, writeFileSync } from "node:fs"
import { execSync } from "node:child_process"

const trackers = JSON.parse(readFileSync("src/core/db/trackers.json", "utf8"))
const companies = new Map(JSON.parse(readFileSync("src/core/db/companies.json", "utf8")).map((item) => [item.id, item]))
const remediation = new Map(JSON.parse(readFileSync("src/core/db/remediation.json", "utf8")).map((item) => [item.id, item]))

const sdkSource = readFileSync("src/core/signals/sdk-globals.ts", "utf8")
const sdkTrackerIds = new Set([...sdkSource.matchAll(/trackerId: "([a-z-]+)"/g)].map((match) => match[1]))

const gitRef = execSync("git rev-parse --short HEAD").toString().trim()
const today = new Date().toISOString().slice(0, 10)

const count = (iterable, predicate) => [...iterable].filter(predicate).length
const tally = (items, key) => {
  const counts = new Map()
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

const rows = trackers.map((tracker) => {
  const company = companies.get(tracker.companyId) ?? {}
  const record = remediation.get(tracker.remediationId)
  return {
    id: tracker.id,
    category: tracker.category,
    parent: company.parentCompany ?? "?",
    domains: tracker.match.domains.length,
    paths: (tracker.match.paths ?? []).length,
    sdk: sdkTrackerIds.has(tracker.id),
    review: tracker.review.status,
    source: tracker.sources[0]?.family ?? "?",
    deletion: Boolean(record?.deletion_url),
    optOut: Boolean(record?.future_collection_url),
    friction: record?.friction_class ?? "?",
    verified: record?.last_verified_at ?? "?",
    contact: Boolean(company.privacyContact),
    explanation: Boolean(tracker.displayName && tracker.observes?.browserVisible?.length && tracker.userImpact?.plainSummary),
    blockingLimits: Boolean(tracker.browserAction?.whatBlockingChanges?.length && tracker.browserAction?.whatBlockingDoesNotChange?.length),
    notVisible: Boolean(tracker.observes?.notVisibleToExtension?.length),
    valuation: Boolean(tracker.perPersonValue),
    valuationSourced: tracker.perPersonValue?.confidence === "sourced"
  }
})

const yn = (value) => (value ? "yes" : "no")
const lines = []
lines.push("---")
lines.push('title: "Tracker DB Baseline"')
lines.push('description: "Generated snapshot of tracker database coverage, provenance, remediation, and SDK-signature state. Regenerate with pnpm db:baseline."')
lines.push("owner: Kenshiki")
lines.push("section: docs")
lines.push(`lastReviewed: ${today}`)
lines.push("status: generated")
lines.push("---")
lines.push("")
lines.push(`> Generated from commit \`${gitRef}\` by \`pnpm db:baseline\`. Do not hand-edit.`)
lines.push("")
lines.push("## Summary")
lines.push("")
lines.push(`- Trackers: **${trackers.length}** (Phase 1 minimum: 25)`)
lines.push(`- Companies: **${companies.size}**, remediation records: **${remediation.size}**`)
lines.push(`- SDK-global signatures: **${count(rows, (r) => r.sdk)}/${trackers.length}** trackers covered`)
lines.push(`- Provenance: **${count(rows, (r) => r.review === "seed")}** seed / **${count(rows, (r) => r.review !== "seed")}** source-backed`)
lines.push(`- Remediation: deletion link **${count(rows, (r) => r.deletion)}/${trackers.length}**, opt-out link **${count(rows, (r) => r.optOut)}/${trackers.length}**`)
lines.push(`- Explanation coverage: **${count(rows, (r) => r.explanation)}/${trackers.length}**`)
lines.push(`- Blocking-limit coverage: **${count(rows, (r) => r.blockingLimits)}/${trackers.length}**`)
lines.push(`- Not-visible-to-extension coverage: **${count(rows, (r) => r.notVisible)}/${trackers.length}**`)
lines.push(`- Valuation coverage: **${count(rows, (r) => r.valuation)}/${trackers.length}** (${count(rows, (r) => r.valuationSourced)} sourced / ${count(rows, (r) => r.valuation && !r.valuationSourced)} estimated)`)
lines.push(`- Blockability classes in use: ${tally(trackers, (t) => t.browserAction.blockability).map(([k, v]) => `\`${k}\` (${v})`).join(", ")}`)
lines.push("")
lines.push("### By category")
lines.push("")
for (const [category, n] of tally(trackers, (t) => t.category)) lines.push(`- ${category}: ${n}`)
lines.push("")
lines.push("## Per-tracker state")
lines.push("")
lines.push("| Tracker | Category | Parent | Domains | Paths | SDK sig | Review | Source | Deletion | Opt-out | Friction | Verified | Privacy contact |")
lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
for (const r of rows) {
  lines.push(
    `| ${r.id} | ${r.category} | ${r.parent} | ${r.domains} | ${r.paths} | ${yn(r.sdk)} | ${r.review} | ${r.source} | ${yn(r.deletion)} | ${yn(r.optOut)} | ${r.friction} | ${r.verified} | ${yn(r.contact)} |`
  )
}
lines.push("")
lines.push("## Gap register")
lines.push("")
const noSdk = rows.filter((r) => !r.sdk).map((r) => r.id)
const noContact = rows.filter((r) => !r.contact).map((r) => r.id)
const noExplanation = rows.filter((r) => !r.explanation).map((r) => r.id)
const noBlockingLimits = rows.filter((r) => !r.blockingLimits).map((r) => r.id)
const noNotVisible = rows.filter((r) => !r.notVisible).map((r) => r.id)
const noValuation = rows.filter((r) => !r.valuation).map((r) => r.id)
const unknownFriction = rows.filter((r) => r.friction === "unknown").map((r) => r.id)
const seedCount = count(rows, (r) => r.review === "seed")
lines.push(`- **Provenance**: ${seedCount} of ${trackers.length} records are hand-authored seeds pending Tracker Radar / EasyPrivacy source backing (Phase 3).`)
lines.push(`- **All trackers are network_blockable** — no \`content_mitigatable\` or \`observable_only\` records exist yet, so only one of six blockability classes is exercised by the DB.`)
lines.push(`- **No SDK-global signature** (${noSdk.length}): ${noSdk.join(", ") || "none"}.`)
lines.push(`- **Unknown remediation friction** (${unknownFriction.length}): ${unknownFriction.join(", ") || "none"}.`)
lines.push(`- **Missing privacy contact** (${noContact.length}): ${noContact.join(", ") || "none"}.`)
lines.push(`- **Missing explanation coverage** (${noExplanation.length}): ${noExplanation.join(", ") || "none"}.`)
lines.push(`- **Missing blocking-limit coverage** (${noBlockingLimits.length}): ${noBlockingLimits.join(", ") || "none"}.`)
lines.push(`- **Missing not-visible-to-extension coverage** (${noNotVisible.length}): ${noNotVisible.join(", ") || "none"}.`)
lines.push(`- **Missing valuation coverage** (${noValuation.length}): ${noValuation.join(", ") || "none"}.`)
const sharedRemediation = tally(trackers, (t) => t.remediationId).filter(([, n]) => n > 1)
lines.push(`- **Shared remediation records**: ${sharedRemediation.map(([k, v]) => `\`${k}\` used by ${v} trackers`).join(", ") || "none"}.`)
lines.push("")

writeFileSync("docs/db-baseline.md", lines.join("\n"))
console.log(`Wrote docs/db-baseline.md (${trackers.length} trackers, commit ${gitRef})`)
