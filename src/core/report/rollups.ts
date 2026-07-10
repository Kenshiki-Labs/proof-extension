import type { ObserverEvent } from "~core/domain/types"
import type { DisplayObservation } from "./compaction"

// Local-state rollups: aggregate the compacted observation rows into the
// cookie-metadata, local-state, and storage-purpose summaries the report
// renders. Counts and takeaway prose only — no keying logic lives here.

export type CookieMetadataRollup = {
  httpOnlyCookies: number
  insecureCookies: number
  javascriptReadableCookies: number
  persistentCookies: number
  sameSiteSummary: string
  sessionCookies: number
  takeaways: string[]
  totalCookies: number
}

export type LocalStateFamily = {
  count: number
  label: string
}

export type LocalStateRollup = {
  backgroundWorkers: number
  browserOnlyRecords: number
  durableRecords: number
  families: LocalStateFamily[]
  headline: string
  scriptReadableRecords: number
  sessionRecords: number
  takeaways: string[]
  totalRecords: number
}

export type LocalStatePurpose = {
  count: number
  keyExamples: string[]
  label: string
}

export type LocalStatePurposeRollup = {
  clearOperations: number
  deleteOperations: number
  headline: string
  localStorageRecords: number
  purposes: LocalStatePurpose[]
  sessionStorageRecords: number
  setOperations: number
  takeaways: string[]
  totalRecords: number
}

export function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function cookieBooleanCount(observations: DisplayObservation[], key: "httpOnly" | "secure" | "session", value: boolean) {
  return observations.filter(({ event }) => event.details?.[key] === value).length
}

function summarizeCookieSameSite(observations: DisplayObservation[]) {
  const counts = new Map<string, number>()
  for (const { event } of observations) {
    const sameSite = typeof event.details?.sameSite === "string" && event.details.sameSite ? event.details.sameSite : "unspecified"
    counts.set(sameSite, (counts.get(sameSite) ?? 0) + 1)
  }
  return [...counts.entries()].map(([label, count]) => `${count} ${label}`).join(" · ") || "None observed"
}

export function buildCookieMetadataRollup(observations: DisplayObservation[]): CookieMetadataRollup {
  const javascriptReadableCookies = cookieBooleanCount(observations, "httpOnly", false)
  const httpOnlyCookies = cookieBooleanCount(observations, "httpOnly", true)
  const insecureCookies = cookieBooleanCount(observations, "secure", false)
  const persistentCookies = cookieBooleanCount(observations, "session", false)
  const takeaways: string[] = []

  if (javascriptReadableCookies > 0) takeaways.push(`${javascriptReadableCookies} ${javascriptReadableCookies === 1 ? "cookie is" : "cookies are"} readable by page scripts, so site code can use the name as a direct state or identifier handle.`)
  if (httpOnlyCookies > 0) takeaways.push(`${httpOnlyCookies} ${httpOnlyCookies === 1 ? "cookie is" : "cookies are"} HttpOnly: page scripts cannot read them, but the browser still sends them back to this site.`)
  if (insecureCookies > 0) takeaways.push(`${insecureCookies} ${insecureCookies === 1 ? "cookie is" : "cookies are"} not marked Secure, so the record is not constrained to HTTPS-only transport by this attribute.`)
  if (persistentCookies > 0) takeaways.push(`${persistentCookies} ${persistentCookies === 1 ? "cookie persists" : "cookies persist"} beyond the current browser session.`)

  return {
    httpOnlyCookies,
    insecureCookies,
    javascriptReadableCookies,
    persistentCookies,
    sameSiteSummary: summarizeCookieSameSite(observations),
    sessionCookies: cookieBooleanCount(observations, "session", true),
    takeaways,
    totalCookies: observations.length
  }
}

function localStateFamilyLabel(eventType: ObserverEvent["eventType"]) {
  if (eventType === "cookie_observed") return "Cookies"
  if (eventType === "storage_write") return "Web Storage"
  if (eventType === "indexeddb_access") return "IndexedDB"
  if (eventType === "cache_storage_access") return "Cache Storage"
  if (eventType === "service_worker_registered") return "Service workers"
  if (eventType === "cache_validator_seen") return "Cache validators"
  return titleCase(eventType)
}

function isScriptReadableLocalState(event: ObserverEvent) {
  if (event.eventType === "storage_write") return true
  if (event.eventType === "indexeddb_access") return true
  if (event.eventType === "cache_storage_access") return true
  if (event.eventType === "service_worker_registered") return true
  if (event.eventType === "cookie_observed") return event.source !== "extension-scan" || event.details?.httpOnly === false
  return false
}

function isBrowserOnlyLocalState(event: ObserverEvent) {
  if (event.eventType === "cache_validator_seen") return true
  return event.eventType === "cookie_observed" && event.details?.httpOnly === true
}

function isDurableLocalState(event: ObserverEvent) {
  if (event.eventType === "indexeddb_access" || event.eventType === "cache_storage_access" || event.eventType === "service_worker_registered") return true
  if (event.eventType === "storage_write") return event.details?.area === "localStorage"
  if (event.eventType === "cookie_observed") return event.details?.session === false || event.source !== "extension-scan"
  return false
}

function isSessionLocalState(event: ObserverEvent) {
  if (event.eventType === "storage_write") return event.details?.area === "sessionStorage"
  return event.eventType === "cookie_observed" && event.details?.session === true
}

export function buildLocalStateRollup(observations: DisplayObservation[]): LocalStateRollup {
  const familiesByLabel = new Map<string, number>()
  let scriptReadableRecords = 0
  let browserOnlyRecords = 0
  let durableRecords = 0
  let sessionRecords = 0
  let backgroundWorkers = 0

  for (const { event } of observations) {
    const label = localStateFamilyLabel(event.eventType)
    familiesByLabel.set(label, (familiesByLabel.get(label) ?? 0) + 1)
    if (isScriptReadableLocalState(event)) scriptReadableRecords += 1
    if (isBrowserOnlyLocalState(event)) browserOnlyRecords += 1
    if (isDurableLocalState(event)) durableRecords += 1
    if (isSessionLocalState(event)) sessionRecords += 1
    if (event.eventType === "service_worker_registered") backgroundWorkers += 1
  }

  const families = [...familiesByLabel.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
  const mechanisms = families.length
  const totalRecords = observations.length
  const takeaways: string[] = []

  if (scriptReadableRecords > 0) takeaways.push(`${scriptReadableRecords} ${scriptReadableRecords === 1 ? "record is" : "records are"} readable or writable by page scripts, so site code can use them directly while you browse.`)
  if (browserOnlyRecords > 0) takeaways.push(`${browserOnlyRecords} ${browserOnlyRecords === 1 ? "record is" : "records are"} browser-only or network-managed: page scripts may not read the value, but the browser can still send or compare it for this site.`)
  if (durableRecords > 0) takeaways.push(`${durableRecords} ${durableRecords === 1 ? "record can" : "records can"} survive beyond the current tab or browser session.`)
  if (backgroundWorkers > 0) takeaways.push(`${backgroundWorkers} background ${backgroundWorkers === 1 ? "worker can" : "workers can"} keep site code active after the page is closed.`)

  return {
    backgroundWorkers,
    browserOnlyRecords,
    durableRecords,
    families,
    headline: totalRecords === 0
      ? "No browser-local state has been recorded for this page yet."
      : `This site left browser-local state in ${mechanisms} ${mechanisms === 1 ? "mechanism" : "mechanisms"}.`,
    scriptReadableRecords,
    sessionRecords,
    takeaways,
    totalRecords
  }
}

function storageKey(event: ObserverEvent) {
  return typeof event.details?.key === "string" ? event.details.key : ""
}

function storageArea(event: ObserverEvent) {
  return typeof event.details?.area === "string" ? event.details.area : ""
}

function storageOperation(event: ObserverEvent) {
  return typeof event.details?.op === "string" ? event.details.op : ""
}

function visibleStorageKeyExample(key: string) {
  return key && !/^\[hidden \d+\]$/.test(key) ? key : null
}

// Order-dependent: the first matching bucket wins, so specific commercial and
// consent vocabularies run before the generic analytics/preferences buckets.
// Bare short words need boundaries — "ads" matched inside "downloads" and
// "uploads", and the bare event|events alternation grabbed queue-ish keys —
// but \b treats "_" as a word character, so the separator-class idiom (same
// as the ga pattern) is used to keep "ads_prefs"/"event_queue" classified.
export function classifyStoragePurpose(key: string): string {
  const normalized = key.toLowerCase()
  if (/cart|basket|checkout|buy|order|commerce/.test(normalized)) return "Cart and commerce"
  if (/consent|privacy|optanon|cmp|gdpr|ccpa|usp|tcf/.test(normalized)) return "Consent and privacy choices"
  if (/auth|login|token|csrf|xsrf|jwt|identity|session|sid\b/.test(normalized)) return "Authentication and session"
  if (/(^|[^a-z])ads?([^a-z]|$)|advert|gclid|fbp|fbc|ttclid|campaign|attribution|pixel/.test(normalized)) return "Advertising and attribution"
  if (/csm|perf|metric|rum|latency|timing|telemetry|diagnostic|eelsts/.test(normalized)) return "Performance and diagnostics"
  if (/analytics|amplitude|mixpanel|segment|heap|(^|[_:\-.])ga([_:\-.]|$)|gtm|(^|[^a-z])events?([^a-z]|$)|fwcim/.test(normalized)) return "Analytics and event queues"
  if (/pref|theme|locale|language|currency|region|zip|postal|store/.test(normalized)) return "Preferences and localization"
  if (/cache|offline|asset|preload/.test(normalized)) return "Cache and offline state"
  if (/test|debug|qa|probe/.test(normalized)) return "Diagnostics and tests"
  return "Unclassified storage keys"
}

export function buildLocalStatePurposeRollup(observations: DisplayObservation[]): LocalStatePurposeRollup {
  const storageObservations = observations.filter(({ event }) => event.eventType === "storage_write")
  const purposesByLabel = new Map<string, LocalStatePurpose>()
  let localStorageRecords = 0
  let sessionStorageRecords = 0
  let setOperations = 0
  let deleteOperations = 0
  let clearOperations = 0

  for (const { event, count } of storageObservations) {
    const area = storageArea(event)
    const op = storageOperation(event)
    const key = storageKey(event)

    if (area === "localStorage") localStorageRecords += count
    if (area === "sessionStorage") sessionStorageRecords += count
    if (op === "set") setOperations += count
    if (op === "remove") deleteOperations += count
    if (op === "clear") clearOperations += count
    if (!key) continue

    const label = classifyStoragePurpose(key)
    const existing = purposesByLabel.get(label) ?? { count: 0, keyExamples: [], label }
    const keyExample = visibleStorageKeyExample(key)
    existing.count += count
    if (keyExample && !existing.keyExamples.includes(keyExample) && existing.keyExamples.length < 4) existing.keyExamples.push(keyExample)
    purposesByLabel.set(label, existing)
  }

  const purposes = [...purposesByLabel.values()].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
  const totalRecords = storageObservations.reduce((sum, observation) => sum + observation.count, 0)
  const takeaways: string[] = []
  const leadingPurpose = purposes[0]

  if (localStorageRecords > 0) takeaways.push(`${localStorageRecords} ${localStorageRecords === 1 ? "action touched" : "actions touched"} localStorage, which can persist after this tab closes.`)
  if (sessionStorageRecords > 0) takeaways.push(`${sessionStorageRecords} ${sessionStorageRecords === 1 ? "action touched" : "actions touched"} sessionStorage, which is scoped to this tab session.`)
  if (deleteOperations > 0) takeaways.push(`${deleteOperations} ${deleteOperations === 1 ? "delete operation shows" : "delete operations show"} the site actively rotating or clearing local keys.`)
  if (clearOperations > 0) takeaways.push(`${clearOperations} ${clearOperations === 1 ? "clear operation wiped" : "clear operations wiped"} all keys in a Web Storage area.`)
  if (leadingPurpose) takeaways.push(`Most Web Storage activity looks like ${leadingPurpose.label.toLowerCase()} based on key names only.`)

  return {
    clearOperations,
    deleteOperations,
    headline: totalRecords === 0
      ? "No Web Storage actions have been recorded for this page yet."
      : `This page made ${totalRecords} Web Storage ${totalRecords === 1 ? "action" : "actions"} across ${purposes.length} likely keyed ${purposes.length === 1 ? "purpose" : "purposes"}.`,
    localStorageRecords,
    purposes,
    sessionStorageRecords,
    setOperations,
    takeaways,
    totalRecords
  }
}
