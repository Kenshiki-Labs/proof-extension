import type { ObserverEvent, SiteSummary } from "~core/domain/types"

function unique(values: string[]) {
  return [...new Set(values)]
}

function companyKey(event: ObserverEvent) {
  return event.companyId ?? event.trackerId ?? (event.firstParty ? event.origin : "unknown")
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
    incomplete: true,
    updatedAt: Date.now()
  }
}

export function upsertEvent(summary: SiteSummary, event: ObserverEvent): SiteSummary {
  const events = [...summary.events.filter((existing) => existing.id !== event.id), event]
  const activeCompanies = events.filter((item) => item.status === "active").map(companyKey)
  const blockedCompanies = events.filter((item) => item.status === "blocked").map(companyKey)
  const mitigatedCompanies = events.filter((item) => item.status === "mitigated").map(companyKey)
  const exposedSignals = events.map((item) => item.eventType)
  const cannotBlockSignals = events.filter((item) => item.status === "cannot_block").map((item) => item.eventType)

  return {
    ...summary,
    origin: event.origin,
    activeCompanies: unique(activeCompanies),
    blockedCompanies: unique(blockedCompanies),
    mitigatedCompanies: unique(mitigatedCompanies),
    exposedSignals: unique(exposedSignals),
    cannotBlockSignals: unique(cannotBlockSignals),
    events,
    incomplete: false,
    updatedAt: Date.now()
  }
}