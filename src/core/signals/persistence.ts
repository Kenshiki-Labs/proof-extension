import type { ObserverEvent } from "~core/domain/types"

// Persistence-surface observation (spec: persistence surfaces are a
// first-class evidence family). This module owns the parts that must be
// deterministic and privileged:
//
// - redaction of names/keys so no raw identifier is ever stored
// - parsing a document.cookie assignment WITHOUT keeping the value
// - normalizing untrusted main-world payloads before they become evidence
//
// The main world reports only bare metadata ("a cookie named X was written,
// ~N bytes"); the privileged side re-redacts every string and rebuilds the
// evidence text itself, so a hostile page can at most claim plausible
// metadata — it can never smuggle a raw value, forge status/blockability, or
// author its own evidence strings. Same trust model as enrichSdkDetection.

export const PERSISTENCE_EVENT_TYPES = [
  "cookie_observed",
  "storage_write",
  "indexeddb_access",
  "cache_storage_access",
  "service_worker_registered"
] as const

export type PersistenceEventType = (typeof PERSISTENCE_EVENT_TYPES)[number]

const PERSISTENCE_EVENT_TYPE_SET = new Set<string>(PERSISTENCE_EVENT_TYPES)

export function isPersistenceEventType(eventType: string): eventType is PersistenceEventType {
  return PERSISTENCE_EVENT_TYPE_SET.has(eventType)
}

const MAX_IDENTIFIER_LENGTH = 64

// A run this long mixing letters and digits is far more likely to be an
// identifier (session id, UUID, base64 token) than a word. Redaction must be
// aggressive here: storing "user key names" that are actually tokens would
// violate the do-not-store rules, while over-masking an ordinary long key
// only costs a little display fidelity.
const HIGH_ENTROPY_RUN = /[A-Za-z0-9+/=_-]{16,}/g

function looksHighEntropy(run: string) {
  return /[0-9]/.test(run) && /[A-Za-z]/.test(run)
}

export function redactIdentifier(value: string): string {
  const masked = value.replace(HIGH_ENTROPY_RUN, (run) => (looksHighEntropy(run) ? `[hidden ${run.length}]` : run))
  if (masked.length <= MAX_IDENTIFIER_LENGTH) return masked
  return `${masked.slice(0, MAX_IDENTIFIER_LENGTH)}…`
}

// Path redaction for service-worker scopes: keep the shape, mask any
// identifier-looking segment, drop query/fragment entirely.
export function redactPath(path: string): string {
  const withoutQuery = path.split(/[?#]/, 1)[0] ?? ""
  return withoutQuery
    .split("/")
    .map((segment) => redactIdentifier(segment))
    .join("/")
}

export type CookieWriteMetadata = {
  name: string
  valueBytes: number
  attributes: string
}

// Parses `document.cookie = "name=value; Path=/; Secure"` into metadata that
// never includes the value. Attribute VALUES are dropped too (an Expires or
// Domain value is structural, but keeping only names is simpler to audit);
// the one exception is nothing — names only.
export function parseCookieWrite(assignment: string): CookieWriteMetadata {
  const [pair = "", ...attributeSegments] = assignment.split(";")
  const separator = pair.indexOf("=")
  const rawName = (separator === -1 ? pair : pair.slice(0, separator)).trim()
  const rawValue = separator === -1 ? "" : pair.slice(separator + 1)

  const attributeNames = attributeSegments
    .map((segment) => segment.split("=", 1)[0]?.trim().toLowerCase() ?? "")
    .filter((name) => name.length > 0)

  return {
    name: redactIdentifier(rawName),
    valueBytes: new TextEncoder().encode(rawValue).length,
    attributes: attributeNames.join(", ")
  }
}

// Rate limiting for main-world reporters: a page writing storage in a loop
// must not become a message storm. Deterministic ids merge into counts in the
// background anyway; past the caps we stop reporting rather than sampling.
export function createRateLimitedReporter<T>(
  report: (id: string, payload: T) => void,
  { maxPerId = 20, maxTotal = 200 }: { maxPerId?: number; maxTotal?: number } = {}
) {
  const perId = new Map<string, number>()
  let total = 0

  return (id: string, payload: T) => {
    if (total >= maxTotal) return
    const count = perId.get(id) ?? 0
    if (count >= maxPerId) return
    perId.set(id, count + 1)
    total += 1
    report(id, payload)
  }
}

function detailString(details: ObserverEvent["details"], key: string): string | null {
  const value = details?.[key]
  return typeof value === "string" && value.length > 0 ? value : null
}

function detailBytes(details: ObserverEvent["details"], key: string): number {
  const value = details?.[key]
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0
  return Math.min(Math.round(value), 1_000_000_000)
}

type SanitizedPersistence = {
  details: Record<string, string | number>
  evidence: string[]
}

const STORAGE_AREA_LANGUAGE: Record<string, string> = {
  localStorage: "storage that persists after this tab closes",
  sessionStorage: "storage kept for this tab session"
}

function sanitizeCookieObserved(details: ObserverEvent["details"]): SanitizedPersistence | null {
  const name = detailString(details, "name")
  if (!name) return null
  const valueBytes = detailBytes(details, "valueBytes")
  const attributes = detailString(details, "attributes")
  const redactedName = redactIdentifier(name)

  return {
    details: { name: redactedName, valueBytes, ...(attributes ? { attributes: redactIdentifier(attributes) } : {}) },
    evidence: [
      `Page script wrote cookie "${redactedName}" (~${valueBytes} bytes) from JavaScript.`,
      "Cookie values are never recorded — only the name and size."
    ]
  }
}

function sanitizeStorageWrite(details: ObserverEvent["details"]): SanitizedPersistence | null {
  const area = detailString(details, "area")
  const op = detailString(details, "op")
  if (!area || !op || !STORAGE_AREA_LANGUAGE[area] || !["set", "remove", "clear"].includes(op)) return null

  const areaLanguage = STORAGE_AREA_LANGUAGE[area]
  if (op === "clear") {
    return {
      details: { area, op },
      evidence: [`Page script cleared all keys in ${areaLanguage}.`]
    }
  }

  const key = detailString(details, "key")
  if (!key) return null
  const redactedKey = redactIdentifier(key)
  const valueBytes = detailBytes(details, "valueBytes")

  return {
    details: { area, op, key: redactedKey, ...(op === "set" ? { valueBytes } : {}) },
    evidence: [
      op === "set"
        ? `Page script saved "${redactedKey}" (~${valueBytes} bytes) to ${areaLanguage}.`
        : `Page script deleted "${redactedKey}" from ${areaLanguage}.`,
      "Stored values are never recorded — only the key name and size."
    ]
  }
}

function sanitizeIndexedDbAccess(details: ObserverEvent["details"]): SanitizedPersistence | null {
  const op = detailString(details, "op")
  const database = detailString(details, "database")
  if (!op || !database || !["open", "deleteDatabase"].includes(op)) return null
  const redactedDatabase = redactIdentifier(database)

  return {
    details: { op, database: redactedDatabase },
    evidence: [
      op === "open"
        ? `Page script opened durable database "${redactedDatabase}" in your browser.`
        : `Page script deleted durable database "${redactedDatabase}" from your browser.`,
      "Database contents are never read — only the name and timing."
    ]
  }
}

function sanitizeCacheStorageAccess(details: ObserverEvent["details"]): SanitizedPersistence | null {
  const op = detailString(details, "op")
  const cache = detailString(details, "cache")
  if (!op || !cache || !["open", "delete", "match", "has"].includes(op)) return null
  const redactedCache = redactIdentifier(cache)
  const verb =
    op === "open" ? "opened" : op === "delete" ? "deleted" : op === "match" ? "searched" : "checked for"

  return {
    details: { op, cache: redactedCache },
    evidence: [
      `Page script ${verb} durable cache "${redactedCache}" in your browser.`,
      "Cached contents are never read — only the cache name and timing."
    ]
  }
}

function sanitizeServiceWorkerRegistered(details: ObserverEvent["details"]): SanitizedPersistence | null {
  const scriptOrigin = detailString(details, "scriptOrigin")
  const scopePath = detailString(details, "scopePath")
  if (!scriptOrigin || !scopePath) return null
  const redactedScope = redactPath(scopePath)

  return {
    details: { scriptOrigin: redactIdentifier(scriptOrigin), scopePath: redactedScope },
    evidence: [
      `The site registered a background worker for scope "${redactedScope}" that can keep running and storing data after this page closes.`
    ]
  }
}

const SANITIZERS: Record<PersistenceEventType, (details: ObserverEvent["details"]) => SanitizedPersistence | null> = {
  cookie_observed: sanitizeCookieObserved,
  storage_write: sanitizeStorageWrite,
  indexeddb_access: sanitizeIndexedDbAccess,
  cache_storage_access: sanitizeCacheStorageAccess,
  service_worker_registered: sanitizeServiceWorkerRegistered
}

// Privileged-side normalization for persistence events arriving over the
// untrusted page channel. Everything a page could forge is re-derived here:
// status is always "active" (observing a write is never an action we took),
// blockability is "observable_only" (there is no request to block), the act
// of observing is "confirmed" (spec confidence rule) — and malformed
// metadata degrades to "weak" with generic evidence instead of being
// trusted. Attribution is deliberately absent: we do not know which script
// performed the write, so no trackerId/companyId claim survives.
export function normalizePersistenceEvent(event: ObserverEvent): ObserverEvent {
  if (!isPersistenceEventType(event.eventType)) return event

  const sanitized = SANITIZERS[event.eventType](event.details)
  const base: ObserverEvent = {
    ...event,
    trackerId: undefined,
    companyId: undefined,
    firstParty: true,
    policyLabel: "unknown_first_party",
    blockability: "observable_only",
    status: "active",
    evidenceTier: "observed"
  }

  if (!sanitized) {
    return {
      ...base,
      confidence: "weak",
      evidence: [`A ${event.eventType.replaceAll("_", " ")} report arrived with malformed metadata and was recorded without detail.`],
      details: undefined
    }
  }

  return {
    ...base,
    confidence: "confirmed",
    evidence: sanitized.evidence,
    details: sanitized.details
  }
}
