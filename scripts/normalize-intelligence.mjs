// Normalizes vendored defense-ai sources into intelligence/normalized/.
// Deterministic by construction (stable sort, no timestamps) so snapshot
// tests can pin the transform. Run via `pnpm intel:normalize`.
//
// Governance (docs/intelligence-standards.md): these outputs are import
// artifacts. They must not affect runtime blocking or popup claims until a
// reviewed join promotes specific records into src/core/db/*.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { getDomain } from "tldts"

const SOURCE_DIR = "intelligence/source/defense-ai"
const OUT_DIR = "intelligence/normalized"
const RETRIEVED_AT = "2026-07-03"

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
  const trackerDomainsByCompany = new Map()
  for (const tracker of trackers) {
    const list = trackerDomainsByCompany.get(tracker.companyId) ?? []
    list.push(...tracker.match.domains.map((domain) => registrableDomain(domain)).filter(Boolean))
    trackerDomainsByCompany.set(tracker.companyId, list)
  }

  const entities = new Map()
  const byDomain = new Map()
  const bySlug = new Map()

  function resolveEntity(name, domains) {
    for (const domain of domains) {
      const existing = byDomain.get(domain)
      if (existing) return existing
    }
    const slug = slugify(name)
    if (slug && bySlug.has(slug)) return bySlug.get(slug)

    const entity = {
      id: slug || `entity-${entities.size + 1}`,
      canonicalName: name,
      aliases: [],
      domains: [],
      facets: { companyIds: [], trackerIds: [], broker2025Ids: [], caRegistry2026Ids: [], defenseDestinationIds: [] }
    }
    // Domain collisions can leave two entities wanting one slug (e.g. a DBA
    // and its parent). Suffix deterministically instead of merging by name.
    while (entities.has(entity.id)) entity.id = `${entity.id}-x`
    entities.set(entity.id, entity)
    if (slug && !bySlug.has(slug)) bySlug.set(slug, entity)
    return entity
  }

  function attach(entity, { name, domains, alias }) {
    for (const domain of domains) {
      if (!byDomain.has(domain)) byDomain.set(domain, entity)
      // A domain belongs to exactly one entity — first claim wins. Listing
      // it on a later entity would make the SSOT ambiguous for joins.
      if (byDomain.get(domain) === entity && !entity.domains.includes(domain)) entity.domains.push(domain)
    }
    if (alias && alias !== entity.canonicalName && !entity.aliases.includes(alias)) entity.aliases.push(alias)
    if (!entity.canonicalName) entity.canonicalName = name
  }

  // Order matters and is fixed: runtime companies first (they anchor ids the
  // extension already uses), then richest-to-broadest external sources.
  for (const company of companies) {
    const domains = uniqueSorted(trackerDomainsByCompany.get(company.id) ?? [])
    const entity = resolveEntity(company.name, domains)
    entity.facets.companyIds.push(company.id)
    for (const tracker of trackers.filter((item) => item.companyId === company.id)) entity.facets.trackerIds.push(tracker.id)
    attach(entity, { name: company.name, domains, alias: company.parentCompany })
  }

  for (const destination of destinations.records) {
    const domains = [registrableDomain(destination.url)].filter(Boolean)
    const entity = resolveEntity(destination.companyName, domains)
    entity.facets.defenseDestinationIds.push(destination.id)
    attach(entity, { name: destination.companyName, domains, alias: destination.displayName })
  }

  for (const broker of californiaBrokers.records) {
    const domains = [registrableDomain(broker.websiteUrl), registrableDomain(broker.privacyRightsUrl)].filter(Boolean)
    const entity = resolveEntity(broker.name, domains)
    entity.facets.caRegistry2026Ids.push(broker.id)
    attach(entity, { name: broker.name, domains, alias: broker.dba })
  }

  for (const broker of brokers.records) {
    const domains = uniqueSorted(broker.websiteUrls.map((url) => registrableDomain(url)).filter(Boolean))
    const entity = resolveEntity(broker.name, domains)
    entity.facets.broker2025Ids.push(broker.id)
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
      }
    }))
    .sort((left, right) => left.id.localeCompare(right.id))

  records = applyEntityLedger(records)

  return {
    schemaVersion: 1,
    sources: [
      {
        family: "kenshiki_defense_registry",
        name: "Kenshiki entity resolution over runtime DB, state registries (2025 merge, CA 2026), and defense destinations",
        version: "1",
        retrieved_at: RETRIEVED_AT,
        license: "Derived index; per-facet licensing follows each source file.",
        transform_notes:
          "Entities resolved by registrable domain first, then exact name slug; no fuzzy matching. Facts remain in per-source normalized files — entities.json only records identity joins. See scripts/normalize-intelligence.mjs."
      }
    ],
    review: {
      status: "source_backed",
      last_reviewed_at: RETRIEVED_AT,
      reviewer: "Kenshiki",
      notes: "SSOT identity index for intelligence sources. Not wired to runtime."
    },
    records
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

mkdirSync(OUT_DIR, { recursive: true })
const brokers = normalizeBrokers()
const destinations = normalizeDefenseDestinations()
const californiaBrokers = normalizeCaliforniaRegistry()
const entities = buildEntities({ brokers, californiaBrokers, destinations })
writeFileSync(`${OUT_DIR}/brokers.json`, JSON.stringify(brokers, null, 2) + "\n")
writeFileSync(`${OUT_DIR}/defense-destinations.json`, JSON.stringify(destinations, null, 2) + "\n")
writeFileSync(`${OUT_DIR}/ca-brokers-2026.json`, JSON.stringify(californiaBrokers, null, 2) + "\n")
writeFileSync(`${OUT_DIR}/entities.json`, JSON.stringify(entities, null, 2) + "\n")
console.log(`Wrote ${OUT_DIR}/brokers.json (${brokers.records.length} brokers)`)
console.log(`Wrote ${OUT_DIR}/defense-destinations.json (${destinations.records.length} destinations)`)
console.log(`Wrote ${OUT_DIR}/ca-brokers-2026.json (${californiaBrokers.records.length} brokers)`)
const multiFacet = entities.records.filter(
  (entity) => Object.values(entity.facets).filter((ids) => ids.length > 0).length > 1
).length
console.log(`Wrote ${OUT_DIR}/entities.json (${entities.records.length} entities, ${multiFacet} with cross-source joins)`)
