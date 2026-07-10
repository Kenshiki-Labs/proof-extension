import { countIdentifiedObservers, countSiteToolObservers, countSourceBackedActiveObservers, countUnclassifiedParties, countWatchingObservers } from "~core/domain/observer-counts"
import { getObserverRemediation } from "~core/domain/remediation"
import { rollupObservedValuations } from "~core/domain/valuation"
import { isDiagnosticEvent, isLocalPageSignalEvent, isPersistenceSurfaceEvent, isUnclassifiedObservation } from "~core/state/summaries"
import { compactEvents, exposureScanEvents, observerName, pageActivityEvents, visibleSignals } from "./compaction"
import type { ObserverEvent, SiteSummary } from "~core/domain/types"

// The copy-to-clipboard report: a self-contained JSON snapshot of everything
// the report tab shows, serialized for pasting into an issue or an email.

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
