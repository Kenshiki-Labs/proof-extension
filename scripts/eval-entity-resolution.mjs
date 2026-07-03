// Entity-resolution evaluation harness. Run via `pnpm intel:eval`.
//
// Labels come from evidence the resolver does NOT use — exact privacy email
// match and street-number+zip address match across the 2025 merge and the CA
// 2026 registry — so the measurement is independent of the thing measured.
// The labeled pair set is generated ONCE (if intelligence/eval/entity-pairs.json
// is absent) and then frozen in git; resolver changes are always measured
// against the same labels. Delete the file deliberately to relabel.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"

const EVAL_DIR = "intelligence/eval"
const PAIRS_PATH = `${EVAL_DIR}/entity-pairs.json`
const METRICS_PATH = `${EVAL_DIR}/resolution-metrics.json`

const brokers2025 = JSON.parse(readFileSync("intelligence/normalized/brokers.json", "utf8")).records
const ca2026 = JSON.parse(readFileSync("intelligence/normalized/ca-brokers-2026.json", "utf8")).records
const entities = [
  ...JSON.parse(readFileSync("intelligence/normalized/entities.json", "utf8")).records,
  ...(existsSync("intelligence/quarantine/research-entities.json")
    ? JSON.parse(readFileSync("intelligence/quarantine/research-entities.json", "utf8")).records
    : [])
]

const clean = (value) => (value ?? "").trim().toLowerCase()

function nameTokens(name) {
  return new Set(
    clean(name)
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((token) => token && !["inc", "llc", "ltd", "corp", "co", "the", "of", "group", "company", "data"].includes(token))
  )
}

function tokenOverlap(a, b) {
  const left = nameTokens(a)
  const right = nameTokens(b)
  if (left.size === 0 || right.size === 0) return 0
  let shared = 0
  for (const token of left) if (right.has(token)) shared++
  return shared / Math.min(left.size, right.size)
}

// "3857 Birch St, PMB 5032, Newport Beach, CA, 92660" → "3857|92660"
function addressKey(address) {
  const trimmed = clean(address)
  if (!trimmed) return null
  const streetNumber = trimmed.match(/^(\d+)\s/)?.[1]
  const zip = trimmed.match(/\b(\d{5})(?:-\d{4})?\b(?!.*\b\d{5}\b)/)?.[1]
  return streetNumber && zip ? `${streetNumber}|${zip}` : null
}

function generateLabels() {
  const positives = []
  const negatives = []

  const byEmail2025 = new Map()
  const byAddress2025 = new Map()
  for (const broker of brokers2025) {
    for (const email of broker.emails) {
      if (!byEmail2025.has(email)) byEmail2025.set(email, [])
      byEmail2025.get(email).push(broker)
    }
    for (const address of broker.addresses) {
      const key = addressKey(address)
      if (!key) continue
      if (!byAddress2025.has(key)) byAddress2025.set(key, [])
      byAddress2025.get(key).push(broker)
    }
  }

  for (const record of ca2026) {
    // Positive: exact email match, or address (street number + zip) match
    // with meaningful name-token overlap. Both signals are unused by the
    // resolver (it matches on domains and name slugs only).
    const emailMatches = record.email ? (byEmail2025.get(record.email) ?? []) : []
    for (const broker of emailMatches) {
      positives.push({
        broker2025Id: broker.id,
        caRegistry2026Id: record.id,
        label: "match",
        evidence: `exact privacy email ${record.email}`
      })
    }
    const addressMatches = record.address ? (byAddress2025.get(addressKey(record.address)) ?? []) : []
    for (const broker of addressMatches) {
      if (emailMatches.includes(broker)) continue
      if (tokenOverlap(broker.name, record.name) >= 0.5) {
        positives.push({
          broker2025Id: broker.id,
          caRegistry2026Id: record.id,
          label: "match",
          evidence: `street number + zip match with name overlap (${broker.name} / ${record.name})`
        })
      }
    }
  }

  // Negatives: deterministic stride sampling of cross pairs sharing NO
  // signal — different email domains, different address keys, zero name
  // token overlap. These are unambiguous non-matches.
  outer: for (let i = 0; negatives.length < 60 && i < ca2026.length; i += 7) {
    const record = ca2026[i]
    for (let j = (i * 13) % brokers2025.length, tries = 0; tries < 20; j = (j + 17) % brokers2025.length, tries++) {
      const broker = brokers2025[j]
      const emailDomain = record.email?.split("@")[1]
      const sharesEmailDomain = emailDomain && broker.emails.some((email) => email.endsWith(`@${emailDomain}`))
      const sharesAddress = record.address && broker.addresses.some((address) => addressKey(address) === addressKey(record.address))
      if (sharesEmailDomain || sharesAddress) continue
      if (tokenOverlap(broker.name, record.name) > 0) continue
      negatives.push({
        broker2025Id: broker.id,
        caRegistry2026Id: record.id,
        label: "non_match",
        evidence: "no shared email domain, address, or name tokens"
      })
      continue outer
    }
  }

  const dedupe = new Map()
  for (const pair of [...positives, ...negatives]) dedupe.set(`${pair.broker2025Id}|${pair.caRegistry2026Id}`, pair)
  const pairs = [...dedupe.values()].sort(
    (a, b) => a.broker2025Id.localeCompare(b.broker2025Id) || a.caRegistry2026Id.localeCompare(b.caRegistry2026Id)
  )

  return {
    schemaVersion: 1,
    method:
      "Positives: exact privacy-email match, or street-number+zip address match with >=0.5 name-token overlap, between the 2025 five-state merge and CA 2026 registry. Negatives: deterministic stride sample sharing no email domain, address key, or name tokens. Signals are independent of the resolver (domains + name slugs). Frozen once committed; delete deliberately to relabel.",
    pairs
  }
}

if (!existsSync(PAIRS_PATH)) {
  mkdirSync(EVAL_DIR, { recursive: true })
  const labels = generateLabels()
  writeFileSync(PAIRS_PATH, JSON.stringify(labels, null, 2) + "\n")
  console.log(`Generated ${PAIRS_PATH}: ${labels.pairs.filter((p) => p.label === "match").length} positives, ${labels.pairs.filter((p) => p.label === "non_match").length} negatives (now frozen — commit it)`)
}

const { pairs } = JSON.parse(readFileSync(PAIRS_PATH, "utf8"))

const entityByBroker2025 = new Map()
const entityByCa2026 = new Map()
for (const entity of entities) {
  for (const id of entity.facets.broker2025Ids) entityByBroker2025.set(id, entity.id)
  for (const id of entity.facets.caRegistry2026Ids) entityByCa2026.set(id, entity.id)
}

let tp = 0
let fp = 0
let fn = 0
let tn = 0
const misses = []
const falseMerges = []
for (const pair of pairs) {
  const predictedMatch =
    entityByBroker2025.get(pair.broker2025Id) !== undefined &&
    entityByBroker2025.get(pair.broker2025Id) === entityByCa2026.get(pair.caRegistry2026Id)
  if (pair.label === "match" && predictedMatch) tp++
  else if (pair.label === "match") {
    fn++
    misses.push(pair)
  } else if (predictedMatch) {
    fp++
    falseMerges.push(pair)
  } else tn++
}

const precision = tp + fp === 0 ? null : tp / (tp + fp)
const recall = tp + fn === 0 ? null : tp / (tp + fn)
const metrics = {
  schemaVersion: 1,
  labeledPairs: pairs.length,
  positives: tp + fn,
  negatives: fp + tn,
  truePositives: tp,
  falsePositives: fp,
  falseNegatives: fn,
  trueNegatives: tn,
  precision,
  recall,
  missedMatches: misses,
  falseMerges
}
// Near-miss report: cross-source pairs the resolver did NOT join but where
// independent evidence (email, address, full name-token containment) says a
// human should look. This is the review queue that turns unresolved
// singletons into either merges (fix the resolver / add an alias) or
// documented non-matches.
function buildNearMisses() {
  const nearMisses = []
  for (const record of ca2026) {
    for (const broker of brokers2025) {
      const sameEntity =
        entityByBroker2025.get(broker.id) !== undefined && entityByBroker2025.get(broker.id) === entityByCa2026.get(record.id)
      if (sameEntity) continue

      const reasons = []
      if (record.email && broker.emails.includes(record.email)) reasons.push(`exact email ${record.email}`)
      if (
        record.address &&
        addressKey(record.address) &&
        broker.addresses.some((address) => addressKey(address) === addressKey(record.address)) &&
        tokenOverlap(broker.name, record.name) >= 0.5
      )
        reasons.push("street number + zip + name overlap")
      if (tokenOverlap(broker.name, record.name) === 1 && nameTokens(record.name).size >= 2)
        reasons.push(`full name-token containment (${broker.name} / ${record.name})`)

      if (reasons.length > 0) {
        nearMisses.push({
          broker2025Id: broker.id,
          broker2025Name: broker.name,
          caRegistry2026Id: record.id,
          caRegistry2026Name: record.name,
          reasons
        })
      }
    }
  }
  return nearMisses.sort(
    (a, b) => a.broker2025Id.localeCompare(b.broker2025Id) || a.caRegistry2026Id.localeCompare(b.caRegistry2026Id)
  )
}

const nearMisses = buildNearMisses()

mkdirSync(EVAL_DIR, { recursive: true })
writeFileSync(
  `${EVAL_DIR}/near-misses.json`,
  JSON.stringify({ schemaVersion: 1, count: nearMisses.length, candidates: nearMisses }, null, 2) + "\n"
)
console.log(`Wrote ${EVAL_DIR}/near-misses.json (${nearMisses.length} review candidates)`)
writeFileSync(METRICS_PATH, JSON.stringify(metrics, null, 2) + "\n")
console.log(
  `Resolution vs ${pairs.length} labeled pairs (${tp + fn} pos / ${fp + tn} neg): precision=${precision?.toFixed(3)} recall=${recall?.toFixed(3)} (missed ${fn}, false-merged ${fp})`
)
