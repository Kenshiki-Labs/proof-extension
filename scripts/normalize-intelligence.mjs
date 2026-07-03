// Normalizes vendored defense-ai sources into intelligence/normalized/.
// Deterministic by construction (stable sort, no timestamps) so snapshot
// tests can pin the transform. Run via `pnpm intel:normalize`.
//
// Governance (docs/intelligence-standards.md): these outputs are import
// artifacts. They must not affect runtime blocking or popup claims until a
// reviewed join promotes specific records into src/core/db/*.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"

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

mkdirSync(OUT_DIR, { recursive: true })
const brokers = normalizeBrokers()
const destinations = normalizeDefenseDestinations()
writeFileSync(`${OUT_DIR}/brokers.json`, JSON.stringify(brokers, null, 2) + "\n")
writeFileSync(`${OUT_DIR}/defense-destinations.json`, JSON.stringify(destinations, null, 2) + "\n")
console.log(`Wrote ${OUT_DIR}/brokers.json (${brokers.records.length} brokers)`)
console.log(`Wrote ${OUT_DIR}/defense-destinations.json (${destinations.records.length} destinations)`)
