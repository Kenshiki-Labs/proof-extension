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

function companyKey(event: ObserverEvent) {
  return event.companyId ?? event.trackerId ?? (event.firstParty ? event.origin : "unknown")
}

function rebuildSummary(summary: SiteSummary, events: ObserverEvent[]): SiteSummary {
  const activeCompanies = events.filter((item) => item.status === "active").map(companyKey)
  const blockedCompanies = events.filter((item) => item.status === "blocked").map(companyKey)
  const mitigatedCompanies = events.filter((item) => item.status === "mitigated").map(companyKey)
  const exposedSignals = events.map((item) => item.eventType)
  const cannotBlockSignals = events.filter((item) => item.status === "cannot_block").map((item) => item.eventType)

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
    pageErrors: summary.pageErrors ?? [],
    incomplete: summary.incomplete ?? true,
    updatedAt: summary.updatedAt ?? Date.now()
  }
}

export function upsertEvent(
  summary: SiteSummary,
  event: ObserverEvent,
  maxEventsPerTab = DEFAULT_MAX_EVENTS_PER_TAB
): SiteSummary {
  const nextEvents = [...summary.events.filter((existing) => existing.id !== event.id), event]
  const events = nextEvents.slice(-maxEventsPerTab)

  return { ...rebuildSummary(summary, events), origin: event.origin, incomplete: false }
}

// Deliberately never dropped by pruneExpiredEvents/retention — a record
// that the page may have broken while this extension was active is exactly
// the kind of thing "no silent action" means should stay visible, not age
// out quietly like routine tracker noise.
export function recordPageError(summary: SiteSummary, pageError: PageError, maxPerTab = MAX_PAGE_ERRORS_PER_TAB): SiteSummary {
  const pageErrors = [...summary.pageErrors, pageError].slice(-maxPerTab)
  return { ...summary, pageErrors, updatedAt: Date.now() }
}