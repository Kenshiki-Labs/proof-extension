import { isIgnoredPageError } from "~core/domain/page-errors"
import type { ObserverEvent, PageError, SiteSummary } from "~core/domain/types"

export const DEFAULT_MAX_EVENTS_PER_TAB = 100
export const MAX_PAGE_ERRORS_PER_TAB = 5
const MS_PER_DAY = 24 * 60 * 60 * 1000

// retentionDays was defined in UserSettingsSchema but nothing ever enforced
// it — maxEventsPerTab caps count, not age, so a tab left open for months
// kept accumulating data indefinitely. This drops events past the retention
// window and rebuilds the derived summary fields from what's left.
export function pruneExpiredEvents(summary: SiteSummary, retentionDays: number, now = Date.now()): SiteSummary {
  const cutoff = now - retentionDays * MS_PER_DAY
  const events = summary.events.filter((event) => event.observedAt >= cutoff)
  if (events.length === summary.events.length) return summary

  return rebuildSummary(summary, events)
}

function unique(values: string[]) {
  return [...new Set(values)]
}

// Housekeeping the extension emits about itself (isolated bridge ready,
// main-world hooks installed, popup-triggered scans) — useful diagnostics,
// but not observations of page behavior. They must never inflate company or
// signal counts, or the report claims observers that do not exist.
// The script_injected clause covers events persisted by builds that used
// that type for housekeeping; real script-injection detections use ids
// prefixed dom_script: and are never diagnostic.
export function isDiagnosticEvent(event: ObserverEvent) {
  if (event.eventType === "extension_diagnostic") return true
  return event.eventType === "script_injected" && !event.id.startsWith("dom_script:")
}

export function isExposureScanEvent(event: ObserverEvent) {
  return event.source === "extension-scan"
}

export function isPageActivityEvent(event: ObserverEvent) {
  return !isDiagnosticEvent(event) && !isExposureScanEvent(event)
}

function companyKey(event: ObserverEvent) {
  return event.companyId ?? event.trackerId ?? (event.firstParty ? event.origin : "unknown")
}

function rebuildSummary(summary: SiteSummary, events: ObserverEvent[]): SiteSummary {
  const observations = events.filter(isPageActivityEvent)
  const activeCompanies = observations.filter((item) => item.status === "active").map(companyKey)
  const blockedCompanies = observations.filter((item) => item.status === "blocked").map(companyKey)
  const mitigatedCompanies = observations.filter((item) => item.status === "mitigated").map(companyKey)
  const exposedSignals = observations.map((item) => item.eventType)
  const cannotBlockSignals = observations.filter((item) => item.status === "cannot_block").map((item) => item.eventType)

  return {
    ...summary,
    activeCompanies: unique(activeCompanies),
    blockedCompanies: unique(blockedCompanies),
    mitigatedCompanies: unique(mitigatedCompanies),
    exposedSignals: unique(exposedSignals),
    cannotBlockSignals: unique(cannotBlockSignals),
    events,
    updatedAt: Date.now()
  }
}

export function createEmptySiteSummary(origin: string, tabId: number): SiteSummary {
  return {
    origin,
    tabId,
    activeCompanies: [],
    blockedCompanies: [],
    mitigatedCompanies: [],
    exposedSignals: [],
    cannotBlockSignals: [],
    events: [],
    pageErrors: [],
    incomplete: true,
    updatedAt: Date.now()
  }
}

export function normalizeSiteSummary(summary: Partial<SiteSummary>, origin = "unknown", tabId = -1): SiteSummary {
  return {
    origin: summary.origin ?? origin,
    tabId: summary.tabId ?? tabId,
    activeCompanies: summary.activeCompanies ?? [],
    blockedCompanies: summary.blockedCompanies ?? [],
    mitigatedCompanies: summary.mitigatedCompanies ?? [],
    exposedSignals: summary.exposedSignals ?? [],
    cannotBlockSignals: summary.cannotBlockSignals ?? [],
    events: summary.events ?? [],
    // Drop known-benign messages here too, not just at the reporter — errors
    // recorded by builds that predate the ignore list live on in storage and
    // would otherwise occupy the small page-error budget forever.
    pageErrors: (summary.pageErrors ?? []).filter((pageError) => !isIgnoredPageError(pageError.message)),
    incomplete: summary.incomplete ?? true,
    updatedAt: summary.updatedAt ?? Date.now()
  }
}

// A DNR block and the webRequest observer both see the same request: the
// observer records request_seen (status active) before the block outcome is
// known. When the block outcome arrives, the seen-event for that same
// request must be superseded — otherwise one blocked request counts its
// company as both "watching" and "blocked".
export function supersedeEvent(summary: SiteSummary, eventId: string): SiteSummary {
  if (!summary.events.some((item) => item.id === eventId)) return summary
  return rebuildSummary(summary, summary.events.filter((item) => item.id !== eventId))
}

export function upsertEvent(
  summary: SiteSummary,
  event: ObserverEvent,
  maxEventsPerTab = DEFAULT_MAX_EVENTS_PER_TAB
): SiteSummary {
  // Same id = same observation recurring, so accumulate its count instead of
  // silently replacing — the popup reports how many times a signal fired.
  const existing = summary.events.find((item) => item.id === event.id)
  const merged = existing ? { ...event, count: (existing.count ?? 1) + (event.count ?? 1) } : event
  const nextEvents = [...summary.events.filter((item) => item.id !== event.id), merged]
  const events = nextEvents.slice(-maxEventsPerTab)

  // The summary origin is the tab's top-level document, set at creation and
  // on main-frame navigation. Events must not rename it — iframe and network
  // events carry their own initiator origins (e.g. an embedded YouTube
  // player), and letting them win misattributes the whole report.
  const origin = summary.origin === "unknown" ? event.origin : summary.origin

  return { ...rebuildSummary(summary, events), origin, incomplete: false }
}

// Deliberately never dropped by pruneExpiredEvents/retention — a record
// that the page may have broken while this extension was active is exactly
// the kind of thing "no silent action" means should stay visible, not age
// out quietly like routine tracker noise.
export function recordPageError(summary: SiteSummary, pageError: PageError, maxPerTab = MAX_PAGE_ERRORS_PER_TAB): SiteSummary {
  // Guard here as well as in the main-world reporter: tabs opened before an
  // extension update keep running the previous content script until reload,
  // so benign messages can still arrive from stale pages.
  if (isIgnoredPageError(pageError.message)) return summary

  const pageErrors = [...summary.pageErrors, pageError].slice(-maxPerTab)
  return { ...summary, pageErrors, updatedAt: Date.now() }
}