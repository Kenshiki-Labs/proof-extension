#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs"
import { getDomain } from "tldts"

const TRACKERS_PATH = "src/core/db/trackers.json"
const COMPANIES_PATH = "src/core/db/companies.json"
const CANDIDATE_SOURCES = [
  {
    key: "broker2025",
    path: "intelligence/normalized/brokers.json",
    scope: "normalized",
    name: (record) => record.name,
    aliases: () => [],
    policyUrls: (record) => [...(record.privacyPolicyUrls ?? []), ...(record.optOutUrls ?? [])],
    urls: (record) => record.websiteUrls ?? [],
    domains: () => []
  },
  {
    key: "ca2026",
    path: "intelligence/normalized/ca-brokers-2026.json",
    scope: "normalized",
    name: (record) => record.name,
    aliases: (record) => [record.dba].filter(Boolean),
    policyUrls: (record) => [record.privacyRightsUrl].filter(Boolean),
    urls: (record) => [record.websiteUrl].filter(Boolean),
    domains: () => []
  },
  {
    key: "runtimeEntity",
    path: "intelligence/normalized/entities.json",
    scope: "normalized",
    name: (record) => record.canonicalName,
    aliases: (record) => record.aliases ?? [],
    policyUrls: () => [],
    urls: () => [],
    domains: (record) => record.domains ?? []
  },
  {
    key: "researchEntity",
    path: "intelligence/quarantine/research-entities.json",
    scope: "quarantine",
    name: (record) => record.canonicalName,
    aliases: (record) => record.aliases ?? [],
    policyUrls: () => [],
    urls: () => [],
    domains: (record) => record.domains ?? []
  }
]
const CONFLICT_PATHS = [
  "intelligence/normalized/entity-conflicts.json",
  "intelligence/quarantine/research-entity-conflicts.json"
]
const SHARED_INFRASTRUCTURE_DOMAINS = new Set([
  "aboutads.info",
  "iabeurope.eu",
  "truste.com",
  "youronlinechoices.com"
])
const HOSTED_DOCUMENT_DOMAINS = new Set([
  "notion.site",
  "vercel.app"
])

function parseArgs(argv) {
  const options = {
    actionableOnly: false,
    finderCandidates: false,
    json: false,
    limit: 20,
    markdown: false,
    observedPath: null,
    observedHosts: [],
    observedRequired: false
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--") {
      continue
    } else if (arg === "--actionable-only") {
      options.actionableOnly = true
    } else if (arg === "--finder-candidates") {
      options.finderCandidates = true
    } else if (arg === "--json") {
      options.json = true
    } else if (arg === "--markdown") {
      options.markdown = true
    } else if (arg === "--limit") {
      const value = Number(argv[index + 1])
      if (!Number.isFinite(value) || value < 1) throw new Error("--limit must be a positive number")
      options.limit = value
      index += 1
    } else if (arg === "--observed") {
      options.observedPath = argv[index + 1]
      if (!options.observedPath) throw new Error("--observed requires a file path or - for stdin")
      index += 1
    } else if (arg === "--host") {
      const host = argv[index + 1]
      if (!host) throw new Error("--host requires a hostname")
      options.observedHosts.push(host)
      index += 1
    } else if (arg === "--observed-required") {
      options.observedRequired = true
    } else if (arg === "--help" || arg === "-h") {
      printUsage()
      process.exit(0)
    } else {
      throw new Error(`Unknown argument ${arg}`)
    }
  }

  return options
}

function printUsage() {
  console.log(`Usage: node scripts/breadth-backlog.mjs [options]

Options:
  --observed <path|->  copied report JSON to mine for unclassified hosts
  --host <hostname>    observed unclassified host; repeatable
  --observed-required  hide rows without observed unclassified overlap
  --actionable-only    print only promotion/action queues, not covered/hold buckets
  --markdown           emit a compact Markdown review queue
  --finder-candidates  emit policy-finder candidate JSON for actionable rows
  --limit <number>     rows per bucket to print (default: 20)
  --json               emit machine-readable JSON
  --help               show this help`)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"))
}

function normalizeDomain(value) {
  if (value == null) return null
  const text = String(value)
    .trim()
    .toLowerCase()
    .replace(/^\*\./, "")
    .replace(/^\.+/, "")
  if (!text || !text.includes(".")) return null

  const candidates = [text]
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(text)) candidates.push(`https://${text}`)

  for (const candidate of candidates) {
    const domain = getDomain(candidate, { allowPrivateDomains: true })
    if (domain) return domain.replace(/^www\./, "")
  }

  const match = text.match(/(?:^|[\s/:@])([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?:[/?#:;,)]|$)/)
  if (!match) return null
  return getDomain(match[1], { allowPrivateDomains: true })
}

function normalizeHost(value) {
  if (value == null) return null
  const text = String(value).trim().toLowerCase().replace(/^\*\./, "")
  if (!text || !text.includes(".")) return null
  try {
    const url = /^[a-z][a-z0-9+.-]*:\/\//.test(text) ? new URL(text) : new URL(`https://${text}`)
    return url.hostname.replace(/^www\./, "")
  } catch {
    const match = text.match(/([a-z0-9-]+(?:\.[a-z0-9-]+)+)/)
    return match?.[1]?.replace(/^www\./, "") ?? null
  }
}

function slug(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(incorporated|inc|llc|ltd|limited|corp|corporation|company|co|plc|gmbh|sa|pte)\b/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort()
}

function addToMapSet(map, key, value) {
  if (!key || !value) return
  const values = map.get(key) ?? new Set()
  values.add(value)
  map.set(key, values)
}

function buildRuntimeIndexes(trackers, companies) {
  const domains = new Map()
  const companyNames = new Map()
  const companiesById = new Map(companies.map((company) => [company.id, company]))

  for (const company of companies) {
    for (const name of [company.id, company.name, company.parentCompany, ...(company.aliases ?? [])]) {
      addToMapSet(companyNames, slug(name), company.id)
    }
  }

  for (const tracker of trackers) {
    for (const domainValue of tracker.match?.domains ?? []) {
      const domain = normalizeDomain(domainValue)
      addToMapSet(domains, domain, tracker.id)
    }
    for (const name of [tracker.id, tracker.displayName]) {
      addToMapSet(companyNames, slug(name), tracker.companyId)
    }
  }

  return { domains, companyNames, companiesById }
}

function buildConflictDomains() {
  const domains = new Map()
  for (const path of CONFLICT_PATHS) {
    if (!existsSync(path)) continue
    const file = readJson(path)
    for (const record of file.records ?? []) {
      const details = record.details ?? {}
      const values = [details.domain, ...(details.domains ?? [])]
      for (const value of values) addToMapSet(domains, normalizeDomain(value), `${path}:${record.id}`)
    }
  }
  return domains
}

function candidateRecordsFromSource(source) {
  if (!existsSync(source.path)) return []
  const file = readJson(source.path)
  return (file.records ?? []).flatMap((record) => {
    const domains = uniqueSorted([
      ...source.domains(record),
      ...source.urls(record)
    ].map(normalizeDomain))
    return domains.map((domain) => ({
      domain,
      sourceKey: source.key,
      sourcePath: source.path,
      sourceScope: source.scope,
      recordId: record.id,
      name: source.name(record),
      aliases: source.aliases(record),
      policyUrls: uniqueSorted(source.policyUrls(record)),
      runtimeCompanyIds: record.facets?.companyIds ?? [],
      runtimeTrackerIds: record.facets?.trackerIds ?? []
    }))
  })
}

function buildCandidates() {
  const byDomain = new Map()
  for (const source of CANDIDATE_SOURCES) {
    for (const record of candidateRecordsFromSource(source)) {
      const candidate = byDomain.get(record.domain) ?? {
        domain: record.domain,
        names: new Set(),
        aliases: new Set(),
        sources: new Set(),
        sourceRecords: [],
        policyUrls: new Set(),
        scopes: new Set(),
        runtimeCompanyIds: new Set(),
        runtimeTrackerIds: new Set()
      }
      candidate.names.add(record.name)
      for (const alias of record.aliases) candidate.aliases.add(alias)
      for (const policyUrl of record.policyUrls) candidate.policyUrls.add(policyUrl)
      candidate.sources.add(record.sourceKey)
      candidate.scopes.add(record.sourceScope)
      for (const companyId of record.runtimeCompanyIds) candidate.runtimeCompanyIds.add(companyId)
      for (const trackerId of record.runtimeTrackerIds) candidate.runtimeTrackerIds.add(trackerId)
      candidate.sourceRecords.push({ source: record.sourceKey, id: record.recordId, path: record.sourcePath, policyUrls: record.policyUrls })
      byDomain.set(record.domain, candidate)
    }
  }
  return [...byDomain.values()]
}

function isUnclassifiedLike(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const id = String(value.id ?? "")
  const status = String(value.status ?? value.classification ?? value.classificationStatus ?? value.trackerStatus ?? "")
  const label = String(value.label ?? value.reason ?? value.summary ?? "")
  return /unclassified/i.test(`${id} ${status} ${label}`)
}

function hostValuesFromObject(value) {
  const details = value.details && typeof value.details === "object" ? value.details : {}
  return [value.host, value.hostname, value.domain, value.url, value.requestUrl, details.host, details.hostname, details.domain, details.url, details.requestUrl]
}

function extractObservedHosts(value, hosts = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) extractObservedHosts(item, hosts)
    return hosts
  }
  if (!value || typeof value !== "object") return hosts

  if (isUnclassifiedLike(value)) {
    for (const rawHost of hostValuesFromObject(value)) {
      const host = normalizeHost(rawHost)
      if (host) hosts.add(host)
    }
  }

  for (const child of Object.values(value)) extractObservedHosts(child, hosts)
  return hosts
}

function loadObservedHosts(options) {
  const hosts = new Set(options.observedHosts.map(normalizeHost).filter(Boolean))
  if (!options.observedPath) return hosts
  const text = options.observedPath === "-" ? readFileSync(0, "utf8") : readFileSync(options.observedPath, "utf8")
  const parsed = JSON.parse(text)
  for (const host of extractObservedHosts(parsed)) hosts.add(host)
  return hosts
}

function observedMatchesForDomain(domain, observedHosts) {
  return [...observedHosts].filter((host) => host === domain || host.endsWith(`.${domain}`)).sort()
}

function sameCompanyIds(candidate, runtime) {
  const direct = [...candidate.runtimeCompanyIds].filter((companyId) => runtime.companiesById.has(companyId))
  if (direct.length > 0) return uniqueSorted(direct)

  const matched = new Set()
  for (const name of [...candidate.names, ...candidate.aliases]) {
    const companyIds = runtime.companyNames.get(slug(name)) ?? []
    for (const companyId of companyIds) matched.add(companyId)
  }
  return uniqueSorted([...matched])
}

function hostedDocumentDomain(domain) {
  return [...HOSTED_DOCUMENT_DOMAINS].some((hostedDomain) => domain === hostedDomain || domain.endsWith(`.${hostedDomain}`))
}

function promotionReadiness({ bucket, candidate, conflictRefs, observedHostsForDomain }) {
  const notes = []
  if (observedHostsForDomain.length > 0) notes.push("observed-unclassified-overlap")
  else if (bucket === "new-runtime-candidate" || bucket === "same-company-missing-domain") notes.push("needs-observed-report-host")

  if (candidate.scopes.has("quarantine")) notes.push("quarantined-research-entity")
  if (conflictRefs.length > 0) notes.push("conflict-or-shared-infrastructure")
  if (hostedDocumentDomain(candidate.domain)) notes.push("hosted-docs-or-site-builder-domain")
  if (candidate.scopes.has("normalized")) notes.push("source-backed-cleaned-file")
  if (bucket === "already-covered") notes.push("already-runtime-covered")
  if (bucket === "same-company-missing-domain") notes.push("same-company-domain-gap")
  if (bucket === "new-runtime-candidate" && observedHostsForDomain.length === 0) notes.push("do-not-promote-without-runtime-observation")
  if (bucket === "new-runtime-candidate" && observedHostsForDomain.length > 0) notes.push("candidate-for-human-source-review")
  return uniqueSorted(notes)
}

function promotionPriority({ bucket, candidate, conflictRefs, observedHostsForDomain }) {
  if (bucket === "already-covered") return "covered"
  if (bucket === "quarantined-conflict" || candidate.scopes.has("quarantine") || conflictRefs.length > 0) return "hold"
  if (observedHostsForDomain.length > 0) return "P0-observed-source-backed"
  if (bucket === "same-company-missing-domain") return "P1-same-company-gap"
  if (candidate.scopes.has("normalized")) return "P2-source-backed-unobserved"
  return "P3-needs-research"
}

function classifyCandidate(candidate, runtime, conflictDomains, observedHosts) {
  const coveredTrackerIds = uniqueSorted([...(runtime.domains.get(candidate.domain) ?? [])])
  const conflictRefs = uniqueSorted([
    ...(conflictDomains.get(candidate.domain) ?? []),
    ...(SHARED_INFRASTRUCTURE_DOMAINS.has(candidate.domain) ? ["shared-privacy-choice-infrastructure"] : []),
    ...(hostedDocumentDomain(candidate.domain) ? ["hosted-docs-or-site-builder-domain"] : [])
  ])
  const matchedCompanyIds = sameCompanyIds(candidate, runtime)
  const observedHostsForDomain = observedMatchesForDomain(candidate.domain, observedHosts)

  let bucket = "new-runtime-candidate"
  if (coveredTrackerIds.length > 0) bucket = "already-covered"
  else if (candidate.scopes.has("quarantine") || conflictRefs.length > 0) bucket = "quarantined-conflict"
  else if (matchedCompanyIds.length > 0) bucket = "same-company-missing-domain"

  const classified = {
    bucket,
    domain: candidate.domain,
    names: uniqueSorted([...candidate.names]),
    aliases: uniqueSorted([...candidate.aliases]),
    policyUrls: uniqueSorted([...candidate.policyUrls]),
    sources: uniqueSorted([...candidate.sources]),
    sourceRecords: candidate.sourceRecords.sort((left, right) => `${left.source}:${left.id}`.localeCompare(`${right.source}:${right.id}`)),
    observedHosts: observedHostsForDomain,
    coveredTrackerIds,
    matchedCompanyIds,
    conflictRefs,
    runtimeTrackerIds: uniqueSorted([...candidate.runtimeTrackerIds]),
    evidenceScore: candidate.sourceRecords.length + candidate.sources.size + (candidate.scopes.has("normalized") ? 2 : 0)
  }
  return {
    ...classified,
    priority: promotionPriority({
      bucket,
      candidate,
      conflictRefs,
      observedHostsForDomain
    }),
    promotionReadiness: promotionReadiness({
      bucket,
      candidate,
      conflictRefs,
      observedHostsForDomain
    })
  }
}

function rankRows(left, right) {
  return (
    Number(right.observedHosts.length > 0) - Number(left.observedHosts.length > 0) ||
    right.observedHosts.length - left.observedHosts.length ||
    right.evidenceScore - left.evidenceScore ||
    left.domain.localeCompare(right.domain)
  )
}

function buildBacklog(options) {
  const trackers = readJson(TRACKERS_PATH)
  const companies = readJson(COMPANIES_PATH)
  const runtime = buildRuntimeIndexes(trackers, companies)
  const conflictDomains = buildConflictDomains()
  const observedHosts = loadObservedHosts(options)
  const rows = buildCandidates().map((candidate) => classifyCandidate(candidate, runtime, conflictDomains, observedHosts)).sort(rankRows)
  const buckets = {
    "already-covered": rows.filter((row) => row.bucket === "already-covered"),
    "same-company-missing-domain": rows.filter((row) => row.bucket === "same-company-missing-domain"),
    "new-runtime-candidate": rows.filter((row) => row.bucket === "new-runtime-candidate"),
    "quarantined-conflict": rows.filter((row) => row.bucket === "quarantined-conflict")
  }

  return {
    inputs: {
      trackers: TRACKERS_PATH,
      companies: COMPANIES_PATH,
      candidates: CANDIDATE_SOURCES.map((source) => source.path),
      conflicts: CONFLICT_PATHS
    },
    summary: {
      runtimeTrackers: trackers.length,
      runtimeCompanies: companies.length,
      candidateDomains: rows.length,
      observedHosts: observedHosts.size,
      observedOverlaps: rows.filter((row) => row.observedHosts.length > 0).length,
      buckets: Object.fromEntries(Object.entries(buckets).map(([bucket, bucketRows]) => [bucket, bucketRows.length]))
    },
    buckets
  }
}

function actionableRows(backlog, options) {
  const rows = [
    ...backlog.buckets["same-company-missing-domain"],
    ...backlog.buckets["new-runtime-candidate"]
  ].sort(rankRows)
  return rows.filter((row) => !options.observedRequired || row.observedHosts.length > 0)
}

function visibleBuckets(backlog, options) {
  if (options.actionableOnly || options.observedRequired) {
    return {
      actionable: actionableRows(backlog, options)
    }
  }
  return backlog.buckets
}

function conventionalPolicyCandidates(row) {
  const root = `https://${row.domain}`
  const policyUrls = row.policyUrls.filter((url) => normalizeDomain(url) === row.domain)
  const privacyUrls = uniqueSorted([
    ...policyUrls.filter((url) => /privacy|personal-information|do-not-sell/i.test(url)),
    `${root}/privacy`,
    `${root}/privacy-policy`,
    `${root}/legal/privacy`,
    `${root}/privacy-notice`
  ])
  const cookieUrls = uniqueSorted([
    ...policyUrls.filter((url) => /cookie|preference|choice|opt/i.test(url)),
    `${root}/cookie-policy`,
    `${root}/cookies`,
    `${root}/privacy#cookies`
  ])
  const termsUrls = uniqueSorted([
    ...policyUrls.filter((url) => /terms|legal/i.test(url)),
    `${root}/terms`,
    `${root}/terms-of-use`,
    `${root}/legal/terms`
  ])
  return {
    key: row.domain.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, ""),
    label: row.names[0] ?? row.domain,
    domains: [row.domain],
    privacyUrl: privacyUrls[0],
    privacyUrls,
    cookieUrl: cookieUrls[0],
    cookieUrls,
    termsUrl: termsUrls[0],
    termsUrls
  }
}

function printFinderCandidates(backlog, options) {
  console.log(JSON.stringify(actionableRows(backlog, options).map(conventionalPolicyCandidates), null, 2))
}

function printMarkdown(backlog, options) {
  const rows = actionableRows(backlog, options).slice(0, options.limit)
  console.log("# Breadth Promotion Queue")
  console.log("")
  console.log(`- Runtime trackers: ${backlog.summary.runtimeTrackers}`)
  console.log(`- Candidate domains: ${backlog.summary.candidateDomains}`)
  console.log(`- Observed overlaps: ${backlog.summary.observedOverlaps}/${backlog.summary.observedHosts}`)
  console.log(`- Actionable rows shown: ${rows.length}`)
  console.log("")

  if (rows.length === 0) {
    console.log("No actionable rows match these filters.")
    return
  }

  for (const row of rows) {
    console.log(`## ${row.domain}`)
    console.log("")
    console.log(`- Priority: ${row.priority}`)
    console.log(`- Bucket: ${row.bucket}`)
    console.log(`- Names: ${row.names.slice(0, 3).join("; ")}`)
    console.log(`- Sources: ${row.sources.join(", ")}`)
    if (row.observedHosts.length > 0) console.log(`- Observed hosts: ${row.observedHosts.join(", ")}`)
    if (row.matchedCompanyIds.length > 0) console.log(`- Existing companies: ${row.matchedCompanyIds.join(", ")}`)
    if (row.policyUrls.length > 0) console.log(`- Registry policy URLs: ${row.policyUrls.slice(0, 3).join(", ")}`)
    console.log(`- Readiness: ${row.promotionReadiness.join(", ")}`)
    console.log(`- Source records: ${row.sourceRecords.map((record) => `${record.source}:${record.id}`).join(", ")}`)
    console.log("- Next action: collect real observed-host evidence, then run policy-finder/source-back verification before runtime promotion.")
    console.log("")
  }
}

function printText(backlog, options) {
  console.log("Breadth backlog")
  console.log(`Runtime: ${backlog.summary.runtimeTrackers} trackers, ${backlog.summary.runtimeCompanies} companies`)
  console.log(`Candidates: ${backlog.summary.candidateDomains} domains; observed overlaps: ${backlog.summary.observedOverlaps}/${backlog.summary.observedHosts} observed hosts`)
  console.log("")

  for (const [bucket, rows] of Object.entries(visibleBuckets(backlog, options))) {
    console.log(`${bucket} (${rows.length})`)
    for (const row of rows.slice(0, options.limit)) {
      const observed = row.observedHosts.length > 0 ? ` observed=${row.observedHosts.join(",")}` : ""
      const companies = row.matchedCompanyIds.length > 0 ? ` companies=${row.matchedCompanyIds.join(",")}` : ""
      const trackers = row.coveredTrackerIds.length > 0 ? ` trackers=${row.coveredTrackerIds.join(",")}` : ""
      const conflicts = row.conflictRefs.length > 0 ? ` conflicts=${row.conflictRefs.length}` : ""
      const readiness = row.promotionReadiness.length > 0 ? ` readiness=${row.promotionReadiness.join(",")}` : ""
      console.log(`  - ${row.domain} — ${row.names.slice(0, 3).join("; ")} [${row.sources.join(", ")}]${observed}${companies}${trackers}${conflicts}${readiness}`)
    }
    if (rows.length > options.limit) console.log(`  … ${rows.length - options.limit} more`)
    console.log("")
  }
}

try {
  const options = parseArgs(process.argv.slice(2))
  const backlog = buildBacklog(options)
  if (options.finderCandidates) printFinderCandidates(backlog, options)
  else if (options.markdown) printMarkdown(backlog, options)
  else if (options.json) console.log(JSON.stringify(backlog, null, 2))
  else printText(backlog, options)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  console.error("Run with --help for usage.")
  process.exit(1)
}