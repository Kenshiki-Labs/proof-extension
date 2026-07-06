import { SiteSummarySchema } from "~core/contracts/schemas"
import { countIdentifiedObservers, countSiteToolObservers, countSourceBackedActiveObservers, countUnclassifiedParties, countWatchingObservers } from "~core/domain/observer-counts"
import { getObserverRemediation } from "~core/domain/remediation"
import { rollupObservedValuations } from "~core/domain/valuation"
import { isDiagnosticEvent, isExposureScanEvent, isLocalPageSignalEvent, isPageActivityEvent, isPersistenceSurfaceEvent, isUnclassifiedObservation } from "~core/state/summaries"
import type { BlockabilityClass, ObservationStatus, ObserverEvent, PageError, SiteSummary } from "~core/domain/types"

export type DisplayObservation = {
  event: ObserverEvent
  count: number
}

export type DisplayPageError = {
  pageError: PageError
  count: number
}

export type AtomicSignalRow = {
  signal: ObserverEvent["eventType"]
  observed: boolean
  status: ObservationStatus
  blockability: BlockabilityClass
  capability: string
  count: number
  latestObservedAt: number
  latestEvidence: string
}

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

export function pageActivityEvents(events: ObserverEvent[]) {
  return events.filter(isPageActivityEvent)
}

export function exposureScanEvents(events: ObserverEvent[]) {
  return events.filter(isExposureScanEvent)
}

export function diagnosticEvents(events: ObserverEvent[]) {
  return events.filter(isDiagnosticEvent)
}

export function persistenceSurfaceObservations(events: ObserverEvent[]) {
  return compactEvents(events).filter(({ event }) => isPersistenceSurfaceEvent(event))
}

export function localPageSignalObservations(events: ObserverEvent[]) {
  return compactEvents(events).filter(({ event }) => isLocalPageSignalEvent(event))
}

export const EMPTY_SUMMARY: SiteSummary = {
  origin: "unknown",
  tabId: -1,
  activeCompanies: [],
  blockedCompanies: [],
  mitigatedCompanies: [],
  exposedSignals: [],
  cannotBlockSignals: [],
  events: [],
  pageErrors: [],
  incomplete: true,
  updatedAt: 0
}

const STATUS_RANK: Record<ObservationStatus, number> = {
  blocked: 4,
  mitigated: 3,
  active: 2,
  cannot_block: 1
}

const BLOCKABILITY_RANK: Record<BlockabilityClass, number> = {
  network_blockable: 6,
  content_mitigatable: 5,
  observable_only: 4,
  user_action_required: 3,
  pre_request_unblockable: 2,
  server_side_unblockable: 1
}

export function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

// Host names render only for events born in the background network
// observer — a page-channel event can never smuggle an arbitrary string
// into the observer list through details.host.
function unclassifiedHost(event: ObserverEvent) {
  if (!isUnclassifiedObservation(event) || event.source !== "network") return null
  return typeof event.details?.host === "string" ? event.details.host : null
}

export function observerName(event: ObserverEvent) {
  const host = unclassifiedHost(event)
  if (host) return host
  return event.companyId ?? event.trackerId ?? (event.firstParty ? "First-party script" : "Unknown observer")
}

export function visibleSignals(summary: SiteSummary) {
  return summary.exposedSignals.filter((signal) => signal !== "extension_diagnostic")
}

export function unclassifiedObservations(events: ObserverEvent[]) {
  return compactEvents(events).filter(({ event }) => isUnclassifiedObservation(event))
}

export function displayEventKey(event: ObserverEvent) {
  const cookieMetadataKey = event.eventType === "cookie_observed" && event.source === "extension-scan"
    ? [event.details?.name ?? "", event.details?.domain ?? "", event.details?.httpOnly ?? "", event.details?.secure ?? "", event.details?.sameSite ?? ""].join(":")
    : ""
  const storageMetadataKey = event.eventType === "storage_write"
    ? [event.details?.area ?? "", event.details?.op ?? "", event.details?.key ?? ""].join(":")
    : ""

  return [
    event.companyId ?? "",
    event.trackerId ?? "",
    unclassifiedHost(event) ?? "",
    event.firstParty ? event.origin : "",
    event.eventType,
    event.source,
    event.status,
    event.blockability,
    typeof event.details?.apiGroup === "string" ? event.details.apiGroup : "",
    cookieMetadataKey,
    storageMetadataKey
  ].join("|")
}

export function compactEvents(events: ObserverEvent[]): DisplayObservation[] {
  const observations = new Map<string, DisplayObservation>()

  for (const event of events) {
    if (isDiagnosticEvent(event)) continue

    const key = displayEventKey(event)
    const existing = observations.get(key)
    const occurrences = event.count ?? 1
    if (!existing) {
      observations.set(key, { event, count: occurrences })
      continue
    }

    observations.set(key, {
      event: event.observedAt >= existing.event.observedAt ? event : existing.event,
      count: existing.count + occurrences
    })
  }

  return [...observations.values()].sort((left, right) => right.event.observedAt - left.event.observedAt)
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

function classifyStoragePurpose(key: string): string {
  const normalized = key.toLowerCase()
  if (/cart|basket|checkout|buy|order|commerce/.test(normalized)) return "Cart and commerce"
  if (/consent|privacy|optanon|cmp|gdpr|ccpa|usp|tcf/.test(normalized)) return "Consent and privacy choices"
  if (/auth|login|token|csrf|xsrf|jwt|identity|session|sid\b/.test(normalized)) return "Authentication and session"
  if (/\bad\b|ads|advert|gclid|fbp|fbc|ttclid|campaign|attribution|pixel/.test(normalized)) return "Advertising and attribution"
  if (/csm|perf|metric|rum|latency|timing|telemetry|diagnostic|eelsts/.test(normalized)) return "Performance and diagnostics"
  if (/analytics|amplitude|mixpanel|segment|heap|(^|[_:\-.])ga([_:\-.]|$)|gtm|event|events|fwcim/.test(normalized)) return "Analytics and event queues"
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

function pageErrorKey(pageError: PageError) {
  return [pageError.message, pageError.stackPreview ?? ""].join("|")
}

export function compactPageErrors(pageErrors: PageError[]): DisplayPageError[] {
  const grouped = new Map<string, DisplayPageError>()

  for (const pageError of pageErrors) {
    const key = pageErrorKey(pageError)
    const existing = grouped.get(key)
    if (!existing) {
      grouped.set(key, { pageError, count: 1 })
      continue
    }

    grouped.set(key, {
      pageError: pageError.observedAt >= existing.pageError.observedAt ? pageError : existing.pageError,
      count: existing.count + 1
    })
  }

  return [...grouped.values()].sort((left, right) => right.pageError.observedAt - left.pageError.observedAt)
}

// One plain sentence per signal, written for a reader with no technical
// background: concrete things (screen size, fonts, graphics card), not
// mechanisms (API, surface, SDK). Honesty rules still apply — factual,
// no reassurance, no fear copy.
export function eventSummary(event: ObserverEvent) {
  if (event.eventType === "canvas_read") return "The page read image data that can identify your device."
  if (event.eventType === "webgl_query") return "The page asked for graphics-card details that can identify your device."
  if (event.eventType === "audio_fingerprint") return "The page tested audio processing in a way that can identify your device."
  if (event.eventType === "font_enumeration") return "The page checked which fonts you have installed."
  if (event.eventType === "identity_digest_observed") return "The page created a SHA-256 identifier hash. The original value and hash were not recorded."
  if (event.eventType === "request_blocked") return "A tracking request was stopped before it left your browser."
  if (event.eventType === "request_seen" && isUnclassifiedObservation(event)) return "A third-party request left your browser. Pulse has not classified it yet."
  if (event.eventType === "request_seen") return "A tracking request left your browser."
  if (event.eventType === "script_injected") return "A new script was added to this page after it loaded."
  if (event.eventType === "sdk_detected") return "A tracking company's software is running inside this page."
  if (event.eventType === "consent_signal_observed") return "The page set up privacy-choice plumbing used by consent and ad systems."
  if (event.eventType === "cookie_sync") return "Two tracking companies swapped IDs so they can combine what they know about you."
  if (event.eventType === "cookie_observed") return "Cookie observed — the page saved a small record in your browser. Its name and size were noted; its contents were not read."
  if (event.eventType === "storage_write") return "Storage write observed — the page saved, changed, or deleted data kept in your browser for this site."
  if (event.eventType === "indexeddb_access") return "Durable storage observed — the page used a database in your browser that lasts between visits."
  if (event.eventType === "cache_storage_access") return "Durable storage observed — the page used your browser's saved-files store, which lasts between visits."
  if (event.eventType === "service_worker_registered") return "The site installed a background worker in your browser that can keep running and storing data after this page closes."
  if (event.eventType === "cache_validator_seen") return "Cache identifier observed — the browser used a freshness marker for saved content. The marker value was not recorded."
  if (event.eventType === "extension_diagnostic") return "A routine self-check by this extension — not something the page did."
  if (event.eventType === "browser_surface") return "Basic facts about your device (screen size, time zone, language) were readable by this page."
  return `${titleCase(event.eventType)} observed.`
}

export function blockabilitySummary(event: Pick<ObserverEvent, "blockability" | "status">) {
  if (event.blockability === "network_blockable") return event.status === "blocked" ? "Seen, then blocked" : "Seen — you can block it"
  if (event.blockability === "content_mitigatable") return event.status === "mitigated" ? "Seen, and limited" : "Seen — it can be limited"
  if (event.blockability === "observable_only") return "Seen — can be watched but not stopped"
  if (event.blockability === "pre_request_unblockable") return "Sent before this extension could act"
  if (event.blockability === "server_side_unblockable") return "Happens on the company's servers — no extension can stop it"
  return "Only fixable at the source — see Stop at source"
}

export function formatDetailKey(value: string) {
  return titleCase(value).replace(/^Url$/, "URL").replace(/^Id$/, "ID")
}

export function detailEntries(event: ObserverEvent) {
  return Object.entries(event.details ?? {}).filter(([, value]) => value !== "")
}

export function formatTime(timestamp: number) {
  if (!timestamp) return "Unknown"
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(timestamp)
}

export function parseSiteSummaryResponse(response: unknown) {
  const payload =
    response && typeof response === "object" && "type" in response && response.type === "SITE_SUMMARY" && "payload" in response
      ? response.payload
      : response
  const normalizedPayload = payload && typeof payload === "object" ? { pageErrors: [], ...payload } : payload
  return SiteSummarySchema.safeParse(normalizedPayload)
}

export function formatCopyEvent(event: ObserverEvent, count: number) {
  const remediation = getObserverRemediation(event)

  return {
    id: event.id,
    count,
    lastObservedAt: new Date(event.observedAt).toISOString(),
    observer: remediation?.observerName ?? observerName(event),
    parentCompany: remediation?.parentCompany,
    origin: event.origin,
    signal: event.eventType,
    source: event.source,
    status: event.status,
    blockability: event.blockability,
    confidence: event.confidence,
    evidenceTier: event.evidenceTier,
    firstParty: event.firstParty,
    policyLabel: event.policyLabel,
    trackerId: event.trackerId,
    companyId: event.companyId,
    frameId: event.frameId,
    details: event.details,
    evidence: event.evidence,
    remediation
  }
}

export function buildCopyPayload(summary: SiteSummary) {
  const pageEvents = pageActivityEvents(summary.events)
  const observations = compactEvents(pageEvents)
  const exposureEvents = exposureScanEvents(summary.events)
  const diagnostics = summary.events.filter(isDiagnosticEvent)

  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      origin: summary.origin,
      tabId: summary.tabId,
      incomplete: summary.incomplete,
      counts: {
        observations: observations.length,
        rawEvents: pageEvents.length,
        unclassifiedObservations: observations.filter(({ event }) => isUnclassifiedObservation(event)).length,
        persistenceObservations: observations.filter(({ event }) => isPersistenceSurfaceEvent(event)).length,
        localPageSignals: observations.filter(({ event }) => isLocalPageSignalEvent(event)).length,
        exposureScanEvents: exposureEvents.length,
        diagnostics: diagnostics.length,
        activeCompanies: countWatchingObservers(summary.events),
        identifiedObservers: countIdentifiedObservers(summary.events),
        unclassifiedParties: countUnclassifiedParties(summary.events),
        sourceBackedActiveObservers: countSourceBackedActiveObservers(summary.events),
        siteToolObservers: countSiteToolObservers(summary.events),
        blockedCompanies: summary.blockedCompanies.length,
        mitigatedCompanies: summary.mitigatedCompanies.length,
        exposedSignals: visibleSignals(summary).length,
        cannotBlockSignals: summary.cannotBlockSignals.length
      },
      perPersonValue: rollupObservedValuations(summary.events),
      observations: observations.map(({ event, count }) => formatCopyEvent(event, count)),
      pageActivityEvents: pageEvents.map((event) => formatCopyEvent(event, event.count ?? 1)),
      exposureScanEvents: exposureEvents.map((event) => formatCopyEvent(event, event.count ?? 1)),
      diagnostics: diagnostics.map((event) => formatCopyEvent(event, event.count ?? 1))
    },
    null,
    2
  )
}

function strongerStatus(left: ObservationStatus, right: ObservationStatus) {
  return STATUS_RANK[left] >= STATUS_RANK[right] ? left : right
}

function strongerBlockability(left: BlockabilityClass, right: BlockabilityClass) {
  return BLOCKABILITY_RANK[left] >= BLOCKABILITY_RANK[right] ? left : right
}

export function buildAtomicSignalRows(events: ObserverEvent[]): AtomicSignalRow[] {
  const rows = new Map<ObserverEvent["eventType"], AtomicSignalRow>()

  for (const event of events) {
    if (isDiagnosticEvent(event)) continue
    if (isExposureScanEvent(event)) continue

    const existing = rows.get(event.eventType)
    const count = event.count ?? 1
    if (!existing) {
      rows.set(event.eventType, {
        signal: event.eventType,
        observed: true,
        status: event.status,
        blockability: event.blockability,
        capability: blockabilitySummary(event),
        count,
        latestObservedAt: event.observedAt,
        latestEvidence: event.evidence[0] ?? eventSummary(event)
      })
      continue
    }

    const status = strongerStatus(existing.status, event.status)
    const blockability = strongerBlockability(existing.blockability, event.blockability)
    const latestEvent = event.observedAt >= existing.latestObservedAt ? event : null
    rows.set(event.eventType, {
      signal: event.eventType,
      observed: true,
      status,
      blockability,
      capability: blockabilitySummary({ status, blockability }),
      count: existing.count + count,
      latestObservedAt: latestEvent?.observedAt ?? existing.latestObservedAt,
      latestEvidence: latestEvent?.evidence[0] ?? existing.latestEvidence
    })
  }

  return [...rows.values()].sort((left, right) => right.latestObservedAt - left.latestObservedAt)
}
