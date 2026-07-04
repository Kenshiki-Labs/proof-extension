// Normalizes vendored defense-ai sources into intelligence/normalized/.
// Deterministic by construction (stable sort, no timestamps) so snapshot
// tests can pin the transform. Run via `pnpm intel:normalize`.
//
// Governance (docs/intelligence-standards.md): these outputs are import
// artifacts. They must not affect runtime blocking or popup claims until a
// reviewed join promotes specific records into src/core/db/*.
import { createHash, createHmac } from "node:crypto"
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { getDomain } from "tldts"

const SOURCE_DIR = "intelligence/source/defense-ai"
const VALUATION_SOURCE_PATH = "intelligence/source/valuations/market-research-2026.json"
const OUT_DIR = "intelligence/normalized"
const QUARANTINE_DIR = "intelligence/quarantine"
const RETRIEVED_AT = "2026-07-03"
const SNAPSHOT_VERSION = RETRIEVED_AT
const SNAPSHOT_DIR = `intelligence/snapshots/${SNAPSHOT_VERSION}`
const ADJUDICATION_PATH = "intelligence/adjudication/entity-adjudications.json"

// --- minimal RFC-4180 CSV parser (quoted fields, embedded commas/newlines) ---
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ""
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ",") {
      row.push(field)
      field = ""
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++
      row.push(field)
      field = ""
      if (row.length > 1 || row[0] !== "") rows.push(row)
      row = []
    } else {
      field += char
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field)
    if (row.length > 1 || row[0] !== "") rows.push(row)
  }
  return rows
}

const clean = (value) => (value ?? "").trim()
const uniqueSorted = (values) => [...new Set(values.filter(Boolean))].sort()

function parseJsonArrayField(value) {
  const trimmed = clean(value)
  if (!trimmed) return []
  try {
    const parsed = JSON.parse(trimmed)
    return Array.isArray(parsed) ? parsed.map(String) : [trimmed]
  } catch {
    return [trimmed]
  }
}

// Registry flag encoding: 1 = collects, 2 = does not collect, 0 = unstated.
function collectsFlag(value) {
  if (value === "1") return "yes"
  if (value === "2") return "no"
  return "unknown"
}

// Merge per-registry flags across a broker's filings. Any state filing that
// says "collects" outweighs another that says "does not" — filings disagree,
// and the conservative reading for a privacy product is exposure, not absence.
function mergeFlag(values) {
  if (values.includes("yes")) return "yes"
  if (values.includes("no")) return "no"
  return "unknown"
}

const COLLECTS_COLUMNS = {
  names: "CollectsNames",
  addresses: "CollectsAddresses",
  dateOfBirth: "CollectsDOB",
  placeOfBirth: "CollectsPOB",
  mothersMaidenName: "CollectsMMN",
  biometricData: "CollectsBiometricData",
  ssnOrGovernmentId: "CollectsSSNGovID",
  minorsData: "CollectsMinorsData",
  reproductiveHealthData: "CollectsReproductiveHealthData",
  employmentData: "CollectsEmploymentData",
  networkData: "CollectsNetworkData",
  commercialData: "CollectsCommercialData",
  otherInfo: "CollectsOtherInfo"
}

function normalizeBrokers() {
  const text = readFileSync(`${SOURCE_DIR}/Data_Broker_Full_Registry_2025.xlsx.csv`, "utf8").replace(/^﻿/, "")
  const [header, ...rows] = parseCsv(text)
  const col = Object.fromEntries(header.map((name, index) => [name, index]))
  const cell = (row, name) => clean(row[col[name]])

  const brokers = new Map()
  for (const row of rows) {
    const id = cell(row, "GroupUUID_Combined")
    if (!id) continue

    const existing = brokers.get(id) ?? {
      id,
      name: cell(row, "Name"),
      registrySources: [],
      websiteUrls: [],
      privacyPolicyUrls: [],
      optOutUrls: [],
      emails: [],
      phones: [],
      contacts: [],
      addresses: [],
      dataCategories: [],
      collectsVotes: Object.fromEntries(Object.keys(COLLECTS_COLUMNS).map((key) => [key, []]))
    }

    existing.registrySources.push(cell(row, "RegistrySource"))
    existing.websiteUrls.push(cell(row, "WebsiteURL"), ...parseJsonArrayField(cell(row, "AdditionalWebsiteURL")))
    existing.privacyPolicyUrls.push(cell(row, "PrivacyPolicyURL"))
    existing.optOutUrls.push(cell(row, "OptOutURL"), ...parseJsonArrayField(cell(row, "AlternateOptOutURLs")))
    existing.emails.push(cell(row, "Email").toLowerCase())
    existing.phones.push(cell(row, "Phone"))
    const contact = cell(row, "ContactPerson")
    if (contact) {
      const title = cell(row, "ContactPersonTitle")
      existing.contacts.push(title ? `${contact} (${title})` : contact)
    }
    const addressParts = [cell(row, "Address"), cell(row, "AddressLine4"), cell(row, "City"), cell(row, "State"), cell(row, "ZipCode"), cell(row, "Country")]
    const address = addressParts.filter(Boolean).join(", ")
    if (address) existing.addresses.push(address)
    existing.dataCategories.push(...parseJsonArrayField(cell(row, "DataCategories")))
    for (const [key, column] of Object.entries(COLLECTS_COLUMNS)) {
      existing.collectsVotes[key].push(collectsFlag(cell(row, column)))
    }

    brokers.set(id, existing)
  }

  const records = [...brokers.values()]
    .map((broker) => ({
      id: broker.id,
      name: broker.name,
      registrySources: uniqueSorted(broker.registrySources),
      websiteUrls: uniqueSorted(broker.websiteUrls),
      privacyPolicyUrls: uniqueSorted(broker.privacyPolicyUrls),
      optOutUrls: uniqueSorted(broker.optOutUrls),
      emails: uniqueSorted(broker.emails),
      phones: uniqueSorted(broker.phones),
      contacts: uniqueSorted(broker.contacts),
      addresses: uniqueSorted(broker.addresses),
      dataCategories: uniqueSorted(broker.dataCategories),
      collects: Object.fromEntries(Object.keys(COLLECTS_COLUMNS).map((key) => [key, mergeFlag(broker.collectsVotes[key])]))
    }))
    .sort((left, right) => left.id.localeCompare(right.id))

  return {
    schemaVersion: 1,
    sources: [
      {
        family: "state_registry",
        name: "US state data-broker registries (Vermont, Oregon, Texas, California AG, California CPPA), 2025 filings",
        version: "2025",
        retrieved_at: RETRIEVED_AT,
        license: "Public-record state registry filings; Kenshiki Labs merge/grouping under repository MIT license.",
        transform_notes:
          "Grouped 3,336 filing rows by GroupUUID_Combined; merged multi-state filings per broker with union of URLs/contacts. Collects flags decoded 1=yes, 2=no, 0=unknown and merged conservatively (any yes wins). See scripts/normalize-intelligence.mjs."
      }
    ],
    review: {
      status: "source_backed",
      last_reviewed_at: RETRIEVED_AT,
      reviewer: "Kenshiki",
      notes: "Normalized import artifact. Not wired to runtime; individual records require review before promotion into src/core/db."
    },
    records
  }
}

function normalizeDefenseDestinations() {
  const registry = JSON.parse(readFileSync(`${SOURCE_DIR}/defense-copy-v3-keyed.json`, "utf8")).registry

  const records = Object.values(registry.destinations)
    .map((destination) => ({
      id: destination.id,
      companyId: destination.companyId,
      companyName: destination.companyName,
      displayName: destination.displayName,
      category: destination.category,
      mode: destination.mode,
      defenseFunction: destination.defenseFunction,
      actionType: destination.actionType,
      collectionLayer: destination.collectionLayer,
      url: destination.url ?? null,
      phoneNumber: destination.phoneNumber ?? null,
      estimatedMinutes: destination.estimatedMinutes ?? null,
      frictionLevel: destination.frictionLevel ?? null,
      costModel: destination.costModel ?? null,
      hasRemovalFee: destination.hasRemovalFee ?? false,
      actorClass: destination.harmProfile?.actorClass ?? null,
      harmSeverity: destination.harmProfile?.harmSeverity ?? null,
      situationIds: [...(destination.situationIds ?? [])].sort(),
      whyMatters: destination.whyMatters ?? null,
      sourceAttribution: destination.sourceAttribution ?? null
    }))
    .sort((left, right) => left.id.localeCompare(right.id))

  return {
    schemaVersion: 1,
    upstreamSchema: registry.schemaVersion,
    upstreamVersion: registry.version != null ? String(registry.version) : null,
    sources: [
      {
        family: "kenshiki_defense_registry",
        name: "Kenshiki defense destination registry (Defense tab source of truth)",
        version: String(registry.version ?? "v3"),
        retrieved_at: RETRIEVED_AT,
        license: "Kenshiki Labs first-party work; repository MIT license.",
        transform_notes:
          "Projected remediation-relevant fields (friction, cost, actor class, harm severity, situation routing) from defense-copy-v3-keyed.json destinations; UI copy, renderer config, and AI guardrails intentionally excluded. See scripts/normalize-intelligence.mjs."
      }
    ],
    review: {
      status: "source_backed",
      last_reviewed_at: RETRIEVED_AT,
      reviewer: "Kenshiki",
      notes: "Normalized import artifact. Not wired to runtime; joins into remediation.json require review."
    },
    records
  }
}

// --- California 2026 registry ---------------------------------------------

function yesNoFlag(value) {
  const normalized = clean(value).toLowerCase()
  if (normalized === "yes" || normalized === "true") return "yes"
  if (normalized === "no" || normalized === "false") return "no"
  return "unknown"
}

function intOrNull(value) {
  const normalized = clean(value).replaceAll(",", "")
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? Math.round(parsed) : null
}

function slugify(name) {
  return clean(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

// Header text uses typographic quotes/hyphens inconsistently; match on a
// simplified form instead of exact strings so a re-export doesn't break us.
function simplifyHeader(header) {
  return clean(header)
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[‑–—]/g, "-")
    .replace(/\s+/g, " ")
}

const CCPA_REQUEST_FAMILIES = [
  ["deleteRequests", "requests to delete - total requests received"],
  ["knowCollectedRequests", "requests to know what personal information is being collected - total requests received"],
  ["knowSoldRequests", "requests to know what personal information is sold or shared - total requests received"],
  ["optOutRequests", "requests to opt out of sale or sharing - total requests received"],
  ["limitSensitiveRequests", "requests to limit the use and disclosure of sensitive personal information - total requests received"]
]

function normalizeCaliforniaRegistry() {
  const text = readFileSync("intelligence/source/ca-registry-2026/California_Data_Broker_Registry_2026.csv", "utf8").replace(/^﻿/, "")
  const [header, ...rows] = parseCsv(text)
  const simplified = header.map(simplifyHeader)
  const indexOfHeader = (fragment) => {
    const index = simplified.findIndex((column) => column.startsWith(simplifyHeader(fragment)))
    if (index === -1) throw new Error(`CA 2026 header not found: ${fragment}`)
    return index
  }
  const cellAt = (row, fragment) => clean(row[indexOfHeader(fragment)])

  const usedIds = new Map()
  const records = rows
    .filter((row) => clean(row[indexOfHeader("Data broker name:")]))
    .map((row) => {
      const name = cellAt(row, "Data broker name:")
      const baseId = slugify(name) || "unnamed"
      const seen = usedIds.get(baseId) ?? 0
      usedIds.set(baseId, seen + 1)
      const id = seen === 0 ? baseId : `${baseId}-${seen + 1}`

      const ccpaMetrics = {}
      for (const [key, startHeader] of CCPA_REQUEST_FAMILIES) {
        const start = indexOfHeader(startHeader)
        ccpaMetrics[key] = {
          received: intOrNull(row[start]),
          compliedInWhole: intOrNull(row[start + 1]),
          compliedInPart: intOrNull(row[start + 2]),
          denied: intOrNull(row[start + 3]),
          meanResponseDays: intOrNull(row[start + 4]),
          medianResponseDays: intOrNull(row[start + 5])
        }
      }

      return {
        id,
        name,
        dba: cellAt(row, "Doing Business As") || null,
        websiteUrl: cellAt(row, "Data broker primary website:") || null,
        email: cellAt(row, "Data broker primary contact email address:").toLowerCase() || null,
        phone: cellAt(row, "Data broker primary phone number:") || null,
        address:
          [
            cellAt(row, "Data broker primary street address:"),
            cellAt(row, "Data broker city:"),
            cellAt(row, "Data broker state:"),
            cellAt(row, "Data broker zip code:"),
            cellAt(row, "Data broker country:")
          ]
            .filter(Boolean)
            .join(", ") || null,
        privacyRightsUrl: cellAt(row, "Data broker's primary website that contains details") || null,
        collects: {
          minorsData: yesNoFlag(cellAt(row, "Data broker collects personal information of minors:")),
          accountLogins: yesNoFlag(cellAt(row, "Data broker collects consumers' account logins")),
          governmentId: yesNoFlag(cellAt(row, "Data broker collects consumers' government-issued identification")),
          citizenshipData: yesNoFlag(cellAt(row, "Data broker collects consumers' citizenship data")),
          unionMembership: yesNoFlag(cellAt(row, "Data broker collects consumers' union membership status")),
          sexualOrientation: yesNoFlag(cellAt(row, "Data broker collects consumers' sexual orientation status")),
          genderIdentity: yesNoFlag(cellAt(row, "Data broker collects consumers' gender identity")),
          biometricData: yesNoFlag(cellAt(row, "Data broker collects consumers' biometric data")),
          preciseGeolocation: yesNoFlag(cellAt(row, "Data broker collects consumers' precise geolocation")),
          reproductiveHealthData: yesNoFlag(cellAt(row, "Data broker collects consumers' reproductive health care data:"))
        },
        sharedOrSoldTo: {
          foreignActor: yesNoFlag(cellAt(row, "Data broker shared or sold consumers' data to a foreign actor")),
          federalGovernment: yesNoFlag(cellAt(row, "Data broker shared or sold consumers' data to the federal government")),
          stateGovernments: yesNoFlag(cellAt(row, "Data broker shared or sold consumers' data to other state governments")),
          lawEnforcement: yesNoFlag(cellAt(row, "Data broker shared or sold consumers' data to law enforcement")),
          genAiDevelopers: yesNoFlag(cellAt(row, "Data broker shared or sold consumers' data to a developer of a GenAI"))
        },
        regulatedBy: {
          fcra: yesNoFlag(cellAt(row, "The data broker or any of its subsidiaries is regulated by the federal Fair Credit Reporting Act")),
          glba: yesNoFlag(cellAt(row, "The data broker or any of its subsidiaries is regulated by the Gramm-Leach-Bliley Act")),
          iippa: yesNoFlag(cellAt(row, "The data broker or any of its subsidiaries is regulated by the California Insurance Information")),
          cmia: yesNoFlag(cellAt(row, "The data broker or any of its subsidiaries is regulated by the California Confidentiality of Medical")),
          hipaa: yesNoFlag(cellAt(row, "The data broker or its subsidiaries are regulated by the HIPAA"))
        },
        ccpaMetrics
      }
    })
    .sort((left, right) => left.id.localeCompare(right.id))

  return {
    schemaVersion: 1,
    sources: [
      {
        family: "state_registry",
        name: "California Data Broker Registry, 2026 filing cycle",
        version: "2026",
        retrieved_at: RETRIEVED_AT,
        license: "Public-record registry filings; normalization under repository MIT license.",
        transform_notes:
          "Parsed 77-column CPPA registry export. Yes/No decoded to yes/no/unknown; CCPA request metrics parsed per family (delete, know-collected, know-sold, opt-out, limit-sensitive) as 6-column blocks; regulatory and sharing disclosures preserved verbatim as flags. See scripts/normalize-intelligence.mjs."
      }
    ],
    review: {
      status: "source_backed",
      last_reviewed_at: RETRIEVED_AT,
      reviewer: "Kenshiki",
      notes: "Normalized import artifact. Not wired to runtime; joins happen via entities.json entity resolution."
    },
    records
  }
}

// --- Entity resolution: the SSOT index --------------------------------------
//
// entities.json is the single source of truth for WHO exists across all
// intelligence sources. Facts stay in the per-source normalized files; each
// entity records which facets (tracker DB, 2025 registries, CA 2026, defense
// destinations) refer to the same real-world organization. Resolution is by
// registrable domain first, then by name slug — deterministic, no fuzzing.

// Public-Suffix-List-backed (tldts): "shop.example.co.uk" → "example.co.uk".
// A naive last-two-labels rule would collapse every co.uk broker into one
// entity; the PSL is the only correct boundary for registrable domains.
function registrableDomain(url) {
  const trimmed = clean(url)
  if (!trimmed) return null
  try {
    const host = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).hostname
    return getDomain(host) ?? null
  } catch {
    return null
  }
}

function buildEntities({ brokers, californiaBrokers, destinations }) {
  const companies = JSON.parse(readFileSync("src/core/db/companies.json", "utf8"))
  const trackers = JSON.parse(readFileSync("src/core/db/trackers.json", "utf8"))
  const adjudications = loadEntityAdjudications()
  const conflicts = []
  const trackerDomainsByCompany = new Map()
  for (const tracker of trackers) {
    const list = trackerDomainsByCompany.get(tracker.companyId) ?? []
    list.push(...tracker.match.domains.map((domain) => registrableDomain(domain)).filter(Boolean))
    trackerDomainsByCompany.set(tracker.companyId, list)
  }

  // Shared-infrastructure guard: a registrable domain claimed as identity
  // evidence by 3+ distinctly named records is not identity evidence — it is
  // a platform artifact (e.g. cloudflare.com from crawler 5xx pages, opt-out
  // SaaS portals). Without this, every broker whose site errored through
  // Cloudflare merges into one false mega-entity.
  const domainClaims = new Map()
  const claimDomain = (domain, name) => {
    if (!domain) return
    const claimant = slugify(name)
    const claimants = domainClaims.get(domain) ?? new Set()
    claimants.add(claimant)
    domainClaims.set(domain, claimants)
  }
  for (const destination of destinations.records) claimDomain(registrableDomain(destination.url), destination.companyName)
  for (const broker of californiaBrokers.records) {
    claimDomain(registrableDomain(broker.websiteUrl), broker.name)
    claimDomain(registrableDomain(broker.privacyRightsUrl), broker.name)
  }
  for (const broker of brokers.records) for (const url of broker.websiteUrls) claimDomain(registrableDomain(url), broker.name)
  const sharedInfrastructureDomains = new Set(
    [...domainClaims.entries()].filter(([, claimants]) => claimants.size >= 3).map(([domain]) => domain)
  )
  for (const domain of [...sharedInfrastructureDomains].sort()) {
    recordConflict("shared_infrastructure_domain", { domain, distinctClaimants: domainClaims.get(domain).size })
  }
  const identityDomains = (domains) => domains.filter((domain) => !sharedInfrastructureDomains.has(domain))

  const entities = new Map()
  const byDomain = new Map()
  const bySlug = new Map()

  function joinEvidence(key, method, evidence) {
    const confidenceByMethod = {
      anchor: { score: 1, label: "confirmed" },
      domain: { score: 0.95, label: "high" },
      name: { score: 0.8, label: "medium" },
      alias: { score: 0.65, label: "low" }
    }
    const confidence = confidenceByMethod[method]
    return {
      key,
      method,
      confidence: confidence.score,
      confidenceLabel: confidence.label,
      reasons: uniqueSorted(evidence)
    }
  }

  function recordConflict(type, details) {
    conflicts.push({ type, ...details })
  }

  // Match strength order: domain (strongest) → exact name slug → alias/DBA
  // slug (weakest). The method is recorded per joined facet so downstream
  // consumers can weigh joins the way the extension weighs evidence.
  function resolveEntity(name, domains, aliasNames = []) {
    const matchedDomainEntities = uniqueSorted(domains.map((domain) => byDomain.get(domain)?.id).filter(Boolean))
    if (matchedDomainEntities.length > 1) {
      recordConflict("domain_points_to_multiple_entities", { name, domains, entityIds: matchedDomainEntities })
    }
    for (const domain of domains) {
      const existing = byDomain.get(domain)
      if (existing) return { entity: existing, method: "domain" }
    }
    const slug = slugify(name)
    if (slug && bySlug.has(slug)) return { entity: bySlug.get(slug), method: "name" }
    for (const aliasName of aliasNames) {
      const aliasSlug = slugify(aliasName ?? "")
      if (aliasSlug && bySlug.has(aliasSlug)) return { entity: bySlug.get(aliasSlug), method: "alias" }
    }

    const entity = {
      id: slug || `entity-${entities.size + 1}`,
      canonicalName: name,
      aliases: [],
      domains: [],
      facets: { companyIds: [], trackerIds: [], broker2025Ids: [], caRegistry2026Ids: [], defenseDestinationIds: [] },
      joins: []
    }
    // Domain collisions can leave two entities wanting one slug (e.g. a DBA
    // and its parent). Suffix deterministically instead of merging by name.
    while (entities.has(entity.id)) entity.id = `${entity.id}-x`
    entities.set(entity.id, entity)
    if (slug && !bySlug.has(slug)) bySlug.set(slug, entity)
    return { entity, method: "anchor" }
  }

  function attach(entity, { name, domains, alias }) {
    for (const domain of domains) {
      const owner = byDomain.get(domain)
      if (!owner) byDomain.set(domain, entity)
      else if (owner !== entity) {
        recordConflict("domain_owner_conflict", { domain, existingEntityId: owner.id, attemptedEntityId: entity.id, attemptedName: name })
      }
      // A domain belongs to exactly one entity — first claim wins. Listing
      // it on a later entity would make the SSOT ambiguous for joins.
      if (byDomain.get(domain) === entity && !entity.domains.includes(domain)) entity.domains.push(domain)
    }
    if (alias && alias !== entity.canonicalName && !entity.aliases.includes(alias)) entity.aliases.push(alias)
    // Aliases become resolution keys too (first claim wins) so a broker
    // filing under its DBA in one registry and its legal name in another
    // still resolves to one entity.
    for (const aliasName of [name, alias]) {
      const aliasSlug = slugify(aliasName ?? "")
      const owner = aliasSlug ? bySlug.get(aliasSlug) : null
      if (aliasSlug && !owner) bySlug.set(aliasSlug, entity)
      else if (owner && owner !== entity) {
        recordConflict("slug_owner_conflict", { slug: aliasSlug, existingEntityId: owner.id, attemptedEntityId: entity.id, attemptedName: name })
      }
    }
    if (!entity.canonicalName) entity.canonicalName = name
  }

  // Order matters and is fixed: runtime companies first (they anchor ids the
  // extension already uses), then richest-to-broadest external sources.
  for (const company of companies) {
    const domains = uniqueSorted(trackerDomainsByCompany.get(company.id) ?? [])
    const { entity, method } = resolveEntity(company.name, domains)
    entity.facets.companyIds.push(company.id)
    entity.joins.push(joinEvidence(`company:${company.id}`, method, [`runtime company ${company.id}`, domains.length > 0 ? `registrable domains: ${domains.join(", ")}` : "no runtime domains"]))
    for (const tracker of trackers.filter((item) => item.companyId === company.id)) entity.facets.trackerIds.push(tracker.id)
    attach(entity, { name: company.name, domains, alias: company.parentCompany })
  }

  for (const destination of destinations.records) {
    const domains = identityDomains([registrableDomain(destination.url)].filter(Boolean))
    const { entity, method } = resolveEntity(destination.companyName, domains, [destination.displayName])
    entity.facets.defenseDestinationIds.push(destination.id)
    entity.joins.push(joinEvidence(`defense:${destination.id}`, method, [`defense destination ${destination.id}`, `company name: ${destination.companyName}`, destination.displayName ? `display name: ${destination.displayName}` : null, domains.length > 0 ? `registrable domains: ${domains.join(", ")}` : null]))
    attach(entity, { name: destination.companyName, domains, alias: destination.displayName })
  }

  for (const broker of californiaBrokers.records) {
    const domains = identityDomains([registrableDomain(broker.websiteUrl), registrableDomain(broker.privacyRightsUrl)].filter(Boolean))
    const { entity, method } = resolveEntity(broker.name, domains, [broker.dba])
    entity.facets.caRegistry2026Ids.push(broker.id)
    entity.joins.push(joinEvidence(`ca2026:${broker.id}`, method, [`CA 2026 registry record ${broker.id}`, `name: ${broker.name}`, broker.dba ? `DBA: ${broker.dba}` : null, domains.length > 0 ? `registrable domains: ${domains.join(", ")}` : null]))
    attach(entity, { name: broker.name, domains, alias: broker.dba })
  }

  for (const broker of brokers.records) {
    const domains = identityDomains(uniqueSorted(broker.websiteUrls.map((url) => registrableDomain(url)).filter(Boolean)))
    const { entity, method } = resolveEntity(broker.name, domains)
    entity.facets.broker2025Ids.push(broker.id)
    entity.joins.push(joinEvidence(`broker2025:${broker.id}`, method, [`2025 registry merge record ${broker.id}`, `name: ${broker.name}`, domains.length > 0 ? `registrable domains: ${domains.join(", ")}` : null]))
    attach(entity, { name: broker.name, domains, alias: null })
  }

  let records = [...entities.values()]
    .map((entity) => ({
      ...entity,
      aliases: uniqueSorted(entity.aliases),
      domains: uniqueSorted(entity.domains),
      facets: {
        companyIds: uniqueSorted(entity.facets.companyIds),
        trackerIds: uniqueSorted(entity.facets.trackerIds),
        broker2025Ids: uniqueSorted(entity.facets.broker2025Ids),
        caRegistry2026Ids: uniqueSorted(entity.facets.caRegistry2026Ids),
        defenseDestinationIds: uniqueSorted(entity.facets.defenseDestinationIds)
      },
      joins: [...entity.joins].sort((a, b) => a.key.localeCompare(b.key))
    }))
    .sort((left, right) => left.id.localeCompare(right.id))

  records = applyAdjudications(records, adjudications)
  records = applyEntityLedger(records)
  const scoped = splitExtensionScope(records, conflicts)
  const conflictReport = buildEntityConflictReport({ records: scoped.extensionRecords, conflicts: scoped.extensionConflicts, adjudications, scope: "extension_runtime" })
  const quarantinedEntities = buildQuarantinedEntities({ records: scoped.quarantinedRecords, adjudications })
  const quarantinedConflictReport = buildEntityConflictReport({
    records: scoped.quarantinedRecords,
    conflicts: scoped.quarantinedConflicts,
    adjudications,
    scope: "quarantined_research"
  })

  const entityIndex = {
    schemaVersion: 1,
    sources: [
      {
        family: "kenshiki_entity_index",
        name: "Kenshiki entity resolution over runtime DB, state registries (2025 merge, CA 2026), and defense destinations",
        version: "1",
        retrieved_at: RETRIEVED_AT,
        license: "Derived index; per-facet licensing follows each source file.",
        transform_notes:
          "Extension-scoped entity index: only entities reachable from runtime tracker/company records remain here. Broker-only and defense-only research entities are quarantined under intelligence/quarantine/. Entities are resolved by PSL registrable domain first, then exact name slug, then DBA/alias slug; no fuzzy matching. Each join records its method as match confidence."
      }
    ],
    review: {
      status: "source_backed",
      last_reviewed_at: RETRIEVED_AT,
      reviewer: "Kenshiki",
      notes: "SSOT identity index for intelligence sources. Not wired to runtime."
    },
    adjudication: {
      path: ADJUDICATION_PATH,
      records: adjudications.records.length,
      appliedRecords: adjudications.records.filter((record) => record.status === "approved").length
    },
    conflictReport: "intelligence/normalized/entity-conflicts.json",
    scope: {
      purpose: "extension_runtime",
      rule: "Keep entities with runtime companyIds or trackerIds; quarantine broker-only and defense-only entities.",
      quarantinedEntityCount: scoped.quarantinedRecords.length,
      quarantinePath: "intelligence/quarantine/research-entities.json"
    },
    records: scoped.extensionRecords
  }

  return { entityIndex, conflictReport, quarantinedEntities, quarantinedConflictReport }
}

function isExtensionEntity(entity) {
  return entity.facets.companyIds.length > 0 || entity.facets.trackerIds.length > 0
}

function conflictTouchesEntities(conflict, entityIds) {
  const ids = [conflict.existingEntityId, conflict.attemptedEntityId, ...(conflict.entityIds ?? [])].filter(Boolean)
  return ids.some((id) => entityIds.has(id))
}

function splitExtensionScope(records, conflicts) {
  const extensionRecords = records.filter(isExtensionEntity)
  const quarantinedRecords = records.filter((entity) => !isExtensionEntity(entity))
  const extensionEntityIds = new Set(extensionRecords.map((entity) => entity.id))
  const extensionConflicts = conflicts.filter((conflict) => conflictTouchesEntities(conflict, extensionEntityIds))
  const quarantinedConflicts = conflicts.filter((conflict) => !conflictTouchesEntities(conflict, extensionEntityIds))
  return { extensionRecords, quarantinedRecords, extensionConflicts, quarantinedConflicts }
}

function buildQuarantinedEntities({ records, adjudications }) {
  return {
    schemaVersion: 1,
    sources: [
      {
        family: "kenshiki_entity_index",
        name: "Quarantined Kenshiki research entity index",
        version: "1",
        retrieved_at: RETRIEVED_AT,
        license: "Derived index; per-facet licensing follows each source file.",
        transform_notes:
          "Entities not reachable from runtime tracker/company records. Preserved for audit and future review, but excluded from the extension SSOT and runtime promotion inputs."
      }
    ],
    review: {
      status: "false_positive_review",
      last_reviewed_at: RETRIEVED_AT,
      reviewer: "Kenshiki",
      notes: "Quarantined research entities are not extension runtime intelligence. Promote only through explicit reviewed links."
    },
    adjudication: {
      path: ADJUDICATION_PATH,
      records: adjudications.records.length,
      appliedRecords: adjudications.records.filter((record) => record.status === "approved").length
    },
    conflictReport: "intelligence/quarantine/research-entity-conflicts.json",
    scope: {
      purpose: "quarantined_research",
      rule: "Broker-only and defense-only entities stay out of intelligence/normalized/entities.json."
    },
    records
  }
}

function loadEntityAdjudications() {
  if (!existsSync(ADJUDICATION_PATH)) return { schemaVersion: 1, records: [] }
  return JSON.parse(readFileSync(ADJUDICATION_PATH, "utf8"))
}

// Apply human decisions to the resolved entities. Only status "approved"
// changes structure; "proposed" records are the review queue and change
// nothing. Merges move the listed facets into the target entity; rejects
// split facets that the resolver wrongly co-located. Adjudicated joins get
// confidence 1.0 — a human decision outranks any heuristic.
const FACET_ARRAY_BY_PREFIX = {
  company: "companyIds",
  broker2025: "broker2025Ids",
  ca2026: "caRegistry2026Ids",
  defense: "defenseDestinationIds"
}

function applyAdjudications(records, adjudications) {
  const approved = adjudications.records.filter((record) => record.status === "approved").sort((a, b) => a.id.localeCompare(b.id))
  if (approved.length === 0) return records

  const entityByFacetKey = new Map()
  const entityById = new Map(records.map((record) => [record.id, record]))
  const facetKeysOf = (entity) =>
    Object.entries(FACET_ARRAY_BY_PREFIX).flatMap(([prefix, field]) => entity.facets[field].map((id) => `${prefix}:${id}`))
  for (const entity of records) for (const key of facetKeysOf(entity)) entityByFacetKey.set(key, entity)

  function moveFacet(key, from, to, adjudication) {
    const prefix = key.slice(0, key.indexOf(":"))
    const id = key.slice(key.indexOf(":") + 1)
    const field = FACET_ARRAY_BY_PREFIX[prefix]
    if (!field) return
    from.facets[field] = from.facets[field].filter((facetId) => facetId !== id)
    if (!to.facets[field].includes(id)) to.facets[field].push(id)
    const join = from.joins.find((item) => item.key === key) ?? {
      key,
      method: "adjudicated",
      confidence: 1,
      confidenceLabel: "confirmed",
      reasons: []
    }
    from.joins = from.joins.filter((item) => item.key !== key)
    to.joins = to.joins.filter((item) => item.key !== key)
    to.joins.push({
      ...join,
      method: "adjudicated",
      confidence: 1,
      confidenceLabel: "confirmed",
      reasons: uniqueSorted([...join.reasons, `adjudication ${adjudication.id} (${adjudication.reviewer}, ${adjudication.reviewed_at ?? "undated"})`])
    })
    entityByFacetKey.set(key, to)
  }

  for (const adjudication of approved) {
    if (adjudication.action === "merge") {
      const target =
        (adjudication.targetEntityId && entityById.get(adjudication.targetEntityId)) ||
        entityByFacetKey.get(adjudication.facetKeys[0])
      if (!target) continue
      for (const key of adjudication.facetKeys) {
        const source = entityByFacetKey.get(key)
        if (!source || source === target) continue
        moveFacet(key, source, target, adjudication)
        // If the source entity is now empty, its identity evidence
        // (domains, aliases) belongs with the merged entity.
        if (facetKeysOf(source).length === 0) {
          target.domains = uniqueSorted([...target.domains, ...source.domains])
          target.aliases = uniqueSorted(
            [...target.aliases, ...source.aliases, source.canonicalName].filter((alias) => alias && alias !== target.canonicalName)
          )
          source.domains = []
          source.aliases = []
        }
      }
    }
    if (adjudication.action === "reject" || adjudication.action === "split") {
      // Facets a human says are NOT the same organization must not share an
      // entity: every facet after the first that co-habits gets its own.
      const [first, ...rest] = adjudication.facetKeys
      const firstEntity = entityByFacetKey.get(first)
      for (const key of rest) {
        const entity = entityByFacetKey.get(key)
        if (!entity || entity !== firstEntity) continue
        const split = {
          id: `${entity.id}-split-${key.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
          canonicalName: key.slice(key.indexOf(":") + 1),
          aliases: [],
          domains: [],
          facets: { companyIds: [], trackerIds: [], broker2025Ids: [], caRegistry2026Ids: [], defenseDestinationIds: [] },
          joins: []
        }
        records.push(split)
        entityById.set(split.id, split)
        moveFacet(key, entity, split, adjudication)
      }
    }
    // action "confirm" is a recorded human endorsement of the existing
    // resolution — annotate confidence, change no structure.
    if (adjudication.action === "confirm") {
      for (const key of adjudication.facetKeys) {
        const entity = entityByFacetKey.get(key)
        const join = entity?.joins.find((item) => item.key === key)
        if (!join) continue
        join.confidence = 1
        join.confidenceLabel = "confirmed"
        join.reasons = uniqueSorted([...join.reasons, `adjudication ${adjudication.id} confirmed by ${adjudication.reviewer}`])
      }
    }
  }

  return records
    .filter((entity) => facetKeysOf(entity).length > 0 || entity.facets.trackerIds.length > 0)
    .map((entity) => ({
      ...entity,
      joins: [...entity.joins].sort((a, b) => a.key.localeCompare(b.key))
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
}

function buildEntityConflictReport({ records, conflicts, adjudications, scope }) {
  const generated = []

  // Conflict ids are namespaced by scope: the extension-runtime and
  // quarantined-research reports each number from 0001, and adjudication
  // records reference conflicts by id — an unscoped "resolver-conflict-0001"
  // would ambiguously match one conflict in EACH report and silently
  // adjudicate an unrelated research conflict.
  const idPrefix = scope === "extension_runtime" ? "runtime-conflict" : "research-conflict"

  for (const [index, conflict] of conflicts.entries()) {
    generated.push({
      id: `${idPrefix}-${String(index + 1).padStart(4, "0")}`,
      type: conflict.type,
      severity: conflict.type === "shared_infrastructure_domain" ? "medium" : "high",
      status: "needs_review",
      entityIds: uniqueSorted([conflict.existingEntityId, conflict.attemptedEntityId, ...(conflict.entityIds ?? [])]),
      facetKeys: [],
      details: Object.fromEntries(Object.entries(conflict).filter(([key]) => key !== "type"))
    })
  }

  for (const entity of records) {
    const weakJoins = entity.joins.filter((join) => join.confidenceLabel === "low")
    if (weakJoins.length === 0) continue
    generated.push({
      id: `weak-join-${entity.id}`,
      type: "low_confidence_join",
      severity: "medium",
      status: "needs_review",
      entityIds: [entity.id],
      facetKeys: weakJoins.map((join) => join.key),
      details: {
        canonicalName: entity.canonicalName,
        joins: weakJoins
      }
    })
  }

  const byConflictKey = new Map(generated.map((conflict) => [conflict.id, conflict]))
  for (const adjudication of adjudications.records) {
    if (adjudication.conflictId && byConflictKey.has(adjudication.conflictId)) {
      const conflict = byConflictKey.get(adjudication.conflictId)
      conflict.status = adjudication.status === "approved" ? "adjudicated" : "needs_review"
      conflict.adjudicationIds = uniqueSorted([...(conflict.adjudicationIds ?? []), adjudication.id])
    }
  }

  const recordsNeedingReview = generated.filter((conflict) => conflict.status === "needs_review")
  return {
    schemaVersion: 1,
    sources: [
      {
        family: "kenshiki_entity_index",
        name: "Kenshiki entity conflict report",
        version: "1",
        retrieved_at: RETRIEVED_AT,
        license: "Derived index; per-facet licensing follows each source file.",
        transform_notes:
          "Generated from resolver domain/slug ownership conflicts plus low-confidence alias joins. Manual decisions are read from intelligence/adjudication/entity-adjudications.json."
      }
    ],
    review: {
      status: recordsNeedingReview.length === 0 ? "source_backed" : "false_positive_review",
      last_reviewed_at: RETRIEVED_AT,
      reviewer: "Kenshiki",
      notes: `${recordsNeedingReview.length} conflict records require manual review before promotion into runtime claims.`
    },
    summary: {
      scope,
      total: generated.length,
      needsReview: recordsNeedingReview.length,
      adjudicated: generated.filter((conflict) => conflict.status === "adjudicated").length,
      manualAdjudications: adjudications.records.length
    },
    records: generated.sort((left, right) => left.id.localeCompare(right.id))
  }
}

// --- Entity ID stability ledger ---------------------------------------------
//
// Entity ids must survive regeneration: adding a source next month must not
// silently rename entities that other artifacts or reviews reference. The
// committed ledger maps every stable per-source record key ("broker2025:x",
// "ca2026:y", …) to the entity id it was first assigned. On each run, an
// entity reclaims the id its members held before; only genuinely new
// entities mint new ids.

const LEDGER_PATH = "intelligence/entity-ledger.json"

function entityFacetKeys(entity) {
  return [
    ...entity.facets.companyIds.map((id) => `company:${id}`),
    ...entity.facets.broker2025Ids.map((id) => `broker2025:${id}`),
    ...entity.facets.caRegistry2026Ids.map((id) => `ca2026:${id}`),
    ...entity.facets.defenseDestinationIds.map((id) => `defense:${id}`)
  ].sort()
}

function applyEntityLedger(records) {
  const ledger = existsSync(LEDGER_PATH) ? JSON.parse(readFileSync(LEDGER_PATH, "utf8")).facetKeyToEntityId : {}

  const assigned = new Set()
  const withStableIds = records.map((entity) => {
    const keys = entityFacetKeys(entity)
    // Vote among prior assignments of this entity's members; ties break
    // lexicographically so the outcome never depends on object order.
    const votes = new Map()
    for (const key of keys) {
      const prior = ledger[key]
      if (prior) votes.set(prior, (votes.get(prior) ?? 0) + 1)
    }
    const candidates = [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id]) => id)
    let id = candidates.find((candidate) => !assigned.has(candidate)) ?? entity.id
    // A split entity (or slug collision with a reclaimed id) mints a fresh
    // deterministic suffix rather than stealing another entity's id.
    let suffix = 2
    while (assigned.has(id)) id = `${entity.id}-${suffix++}`
    assigned.add(id)
    return { ...entity, id }
  })

  const sorted = withStableIds.sort((left, right) => left.id.localeCompare(right.id))
  const facetKeyToEntityId = {}
  for (const entity of sorted) for (const key of entityFacetKeys(entity)) facetKeyToEntityId[key] = entity.id
  const orderedLedger = Object.fromEntries(Object.entries(facetKeyToEntityId).sort(([a], [b]) => a.localeCompare(b)))
  writeFileSync(LEDGER_PATH, JSON.stringify({ schemaVersion: 1, facetKeyToEntityId: orderedLedger }, null, 2) + "\n")
  return sorted
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

function writeSnapshotManifest(paths) {
  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"))
  const artifacts = paths
    .map((path) => ({ path, sha256: sha256File(path) }))
    .sort((left, right) => left.path.localeCompare(right.path))
  const unsigned = {
    schemaVersion: 1,
    snapshotVersion: SNAPSHOT_VERSION,
    packageVersion: packageJson.version,
    generatedAt: RETRIEVED_AT,
    signing: {
      algorithm: "HMAC-SHA256",
      keyEnv: "INTELLIGENCE_SNAPSHOT_SIGNING_KEY",
      status: process.env.INTELLIGENCE_SNAPSHOT_SIGNING_KEY ? "signed" : "unsigned_no_key"
    },
    artifacts
  }
  const payload = JSON.stringify(unsigned)
  const signature = process.env.INTELLIGENCE_SNAPSHOT_SIGNING_KEY
    ? createHmac("sha256", process.env.INTELLIGENCE_SNAPSHOT_SIGNING_KEY).update(payload).digest("hex")
    : null
  const manifest = { ...unsigned, signature }
  const manifestPath = `${SNAPSHOT_DIR}/manifest.json`
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n")
  return manifestPath
}

// The Defense tab's product surface — UX copy, situation routing, harm
// rationale, AI guardrails, renderer config — was AI-generated from the
// registry data, which makes it derived intelligence, not hand curation.
// It therefore lives in the SSOT under the same governance: verbatim
// projection, provenance, schema validation, staleness gate. The lean
// defense-destinations.json remains the remediation-join view; this file is
// the complete surface a consumer app (e.g. the iOS Defense tab) renders.
function normalizeDefenseProductSurface() {
  const source = JSON.parse(readFileSync(`${SOURCE_DIR}/defense-copy-v3-keyed.json`, "utf8"))
  const registry = source.registry

  const sortedDestinations = Object.fromEntries(
    Object.keys(registry.destinations)
      .sort()
      .map((key) => [key, registry.destinations[key]])
  )

  return {
    schemaVersion: 1,
    upstreamSchema: registry.schemaVersion,
    upstreamVersion: registry.version != null ? String(registry.version) : null,
    sources: [
      {
        family: "kenshiki_defense_registry",
        name: "Kenshiki defense registry product surface (AI-generated copy, routing, guardrails)",
        version: String(registry.version ?? "v3"),
        retrieved_at: RETRIEVED_AT,
        license: "Kenshiki Labs first-party work; repository MIT license.",
        transform_notes:
          "Verbatim projection of the AI-generated product surface: top-level ui/modes/categories/renderer/fields/statuses copy blocks plus the complete destination records (nextSteps, whyMatters, harmProfile rationale, aiGuidance guardrails, renderer and prestage config) and routing structures (situations, topRecommendationIds, destinationOrder, badgeSchema, harmProfileMeta, primitiveDecisionPolicy). Destinations re-keyed in sorted order for determinism; no content changes. See scripts/normalize-intelligence.mjs."
      }
    ],
    review: {
      status: "source_backed",
      last_reviewed_at: RETRIEVED_AT,
      reviewer: "Kenshiki",
      notes: "AI-generated product surface under SSOT governance. Models reformat these structured facts; they must not invent destinations, harm ratings, or legal claims (defense_kenshiki_spec.md)."
    },
    copy: {
      ui: source.ui,
      modes: source.modes,
      categories: source.categories,
      renderer: source.renderer,
      fields: source.fields,
      statuses: source.statuses
    },
    routing: {
      topRecommendationIds: registry.topRecommendationIds,
      situations: registry.situations,
      destinationOrder: registry.destinationOrder,
      badgeSchema: registry.badgeSchema,
      harmProfileMeta: registry.harmProfileMeta,
      primitiveDecisionPolicy: registry.primitiveDecisionPolicy,
      referenceIntelligence: registry.referenceIntelligence
    },
    destinations: sortedDestinations
  }
}

function normalizeValuations({ entities }) {
  const source = JSON.parse(readFileSync(VALUATION_SOURCE_PATH, "utf8"))
  const trackers = JSON.parse(readFileSync("src/core/db/trackers.json", "utf8"))
  const trackerIds = new Set(trackers.map((tracker) => tracker.id))
  const entityById = new Map(entities.records.map((entity) => [entity.id, entity]))
  const recordsByTrackerId = new Map()

  for (const finding of source.findings) {
    const entity = entityById.get(finding.subjectEntityId)
    if (!entity) throw new Error(`Valuation finding ${finding.id} references unknown entity ${finding.subjectEntityId}`)

    for (const trackerId of finding.projection.appliesToTrackerIds) {
      if (!trackerIds.has(trackerId)) throw new Error(`Valuation finding ${finding.id} references unknown tracker ${trackerId}`)
      if (!entity.facets.trackerIds.includes(trackerId)) {
        throw new Error(`Valuation finding ${finding.id} projects to ${trackerId}, which is not joined to entity ${finding.subjectEntityId}`)
      }
      if (recordsByTrackerId.has(trackerId)) throw new Error(`Duplicate valuation projection for tracker ${trackerId}`)

      const annualMidpointUsd = (finding.annualLowUsd + finding.annualHighUsd) / 2
      recordsByTrackerId.set(trackerId, {
        trackerId,
        subjectEntityId: finding.subjectEntityId,
        sourceFindingIds: [finding.id],
        perPersonValue: {
          schemaVersion: 1,
          currency: finding.currency,
          geography: finding.geography,
          userProfile: finding.userProfile,
          valueType: finding.valueType,
          monetizationFlow: finding.monetizationFlow,
          perVisit: {
            microdollars: finding.perVisitMicrodollars,
            dollars: finding.perVisitMicrodollars / 1_000_000,
            basis: finding.perVisitBasis
          },
          annual: {
            low_usd: finding.annualLowUsd,
            high_usd: finding.annualHighUsd,
            midpoint_usd: annualMidpointUsd
          },
          valueNote: finding.valueNote,
          sourceNote: finding.sourceNote,
          sourceFindingIds: [finding.id],
          lastUpdated: finding.lastUpdated,
          confidence: finding.confidence
        }
      })
    }
  }

  const missingTrackerIds = [...trackerIds].filter((trackerId) => !recordsByTrackerId.has(trackerId)).sort()
  if (missingTrackerIds.length > 0) throw new Error(`Missing valuation projections for trackers: ${missingTrackerIds.join(", ")}`)

  return {
    schemaVersion: 1,
    sources: [
      {
        family: "market_research",
        name: "Kenshiki market research valuation corpus",
        version: "2026",
        retrieved_at: RETRIEVED_AT,
        license: "Kenshiki Labs curated research notes; external source attribution preserved per finding.",
        transform_notes:
          "Projected source findings through extension-scoped entities into one per-tracker perPersonValue block. Derived fields perVisit.dollars and annual.midpoint_usd are computed by the normalizer, never authored in the source corpus."
      }
    ],
    review: {
      status: "source_backed",
      last_reviewed_at: RETRIEVED_AT,
      reviewer: "Kenshiki",
      notes: "Valuation estimates only. This artifact does not support tracker identity, collection behavior, blocking policy, or remediation claims."
    },
    sourceFindingCount: source.findings.length,
    records: [...recordsByTrackerId.values()].sort((left, right) => left.trackerId.localeCompare(right.trackerId))
  }
}

mkdirSync(OUT_DIR, { recursive: true })

mkdirSync(QUARANTINE_DIR, { recursive: true })
const brokers = normalizeBrokers()
const destinations = normalizeDefenseDestinations()
const productSurface = normalizeDefenseProductSurface()
const californiaBrokers = normalizeCaliforniaRegistry()
const { entityIndex: entities, conflictReport, quarantinedEntities, quarantinedConflictReport } = buildEntities({ brokers, californiaBrokers, destinations })
const valuations = normalizeValuations({ entities })
const outputPaths = {
  brokers: `${OUT_DIR}/brokers.json`,
  destinations: `${OUT_DIR}/defense-destinations.json`,
  productSurface: `${OUT_DIR}/defense-product-surface.json`,
  californiaBrokers: `${OUT_DIR}/ca-brokers-2026.json`,
  valuations: `${OUT_DIR}/valuations.json`,
  entities: `${OUT_DIR}/entities.json`,
  conflicts: `${OUT_DIR}/entity-conflicts.json`,
  quarantinedEntities: `${QUARANTINE_DIR}/research-entities.json`,
  quarantinedConflicts: `${QUARANTINE_DIR}/research-entity-conflicts.json`,
  ledger: LEDGER_PATH,
  adjudications: ADJUDICATION_PATH
}
writeFileSync(outputPaths.brokers, JSON.stringify(brokers, null, 2) + "\n")
writeFileSync(outputPaths.destinations, JSON.stringify(destinations, null, 2) + "\n")
writeFileSync(outputPaths.productSurface, JSON.stringify(productSurface, null, 2) + "\n")
writeFileSync(outputPaths.californiaBrokers, JSON.stringify(californiaBrokers, null, 2) + "\n")
writeFileSync(outputPaths.valuations, JSON.stringify(valuations, null, 2) + "\n")
writeFileSync(outputPaths.entities, JSON.stringify(entities, null, 2) + "\n")
writeFileSync(outputPaths.conflicts, JSON.stringify(conflictReport, null, 2) + "\n")
writeFileSync(outputPaths.quarantinedEntities, JSON.stringify(quarantinedEntities, null, 2) + "\n")
writeFileSync(outputPaths.quarantinedConflicts, JSON.stringify(quarantinedConflictReport, null, 2) + "\n")
const manifestPath = writeSnapshotManifest(Object.values(outputPaths))
console.log(`Wrote ${OUT_DIR}/brokers.json (${brokers.records.length} brokers)`)
console.log(`Wrote ${OUT_DIR}/defense-destinations.json (${destinations.records.length} destinations)`)
console.log(`Wrote ${OUT_DIR}/defense-product-surface.json (${Object.keys(productSurface.destinations).length} destinations, full copy/routing/guardrails)`)
console.log(`Wrote ${OUT_DIR}/ca-brokers-2026.json (${californiaBrokers.records.length} brokers)`)
console.log(`Wrote ${OUT_DIR}/valuations.json (${valuations.records.length} tracker valuations from ${valuations.sourceFindingCount} findings)`)
const multiFacet = entities.records.filter(
  (entity) => Object.values(entity.facets).filter((ids) => ids.length > 0).length > 1
).length
console.log(`Wrote ${OUT_DIR}/entities.json (${entities.records.length} entities, ${multiFacet} with cross-source joins)`)
console.log(`Wrote ${OUT_DIR}/entity-conflicts.json (${conflictReport.summary.needsReview} needing review)`)
console.log(`Wrote ${QUARANTINE_DIR}/research-entities.json (${quarantinedEntities.records.length} quarantined entities)`)
console.log(`Wrote ${QUARANTINE_DIR}/research-entity-conflicts.json (${quarantinedConflictReport.summary.needsReview} needing review)`)
console.log(`Wrote ${manifestPath}`)
