import { compactEvents } from "~core/report/display"
import { countIdentifiedObservers, countPrivacyTradeObservers, countSiteToolObservers, countSourceBackedActiveObservers, countUnclassifiedParties, countWatchingObservers } from "~core/domain/observer-counts"
import { isDiagnosticEvent, isExposureScanEvent, isLocalPageSignalEvent, isPageActivityEvent, isPersistenceSurfaceEvent, isUnclassifiedObservation } from "~core/state/summaries"
import type { SiteSummary } from "~core/domain/types"

// THE single source of truth for every headline number the popup, the
// report tab, and the copy payload display. Both surfaces read the same
// stored summary, but before this module each computed its own counts under
// the same labels — "Signals 3" on the report vs "Signals 26" in the popup
// for the same tab. Identical labels must mean identical math, so the math
// lives in exactly one place.

export type SummaryMetrics = {
  // Grouped observations: one per observer + signal combination (merged by
  // the compaction key). What a user should read as "how many distinct
  // things were seen".
  observations: number
  // Raw recorded page-activity entries, before any merging — always >= the
  // observations count. Excludes the extension's own diagnostics AND the
  // extension-run exposure scan, neither of which is something the page did.
  recordedEvents: number
  // Extension-run exposure scan events (what Pulse could read locally).
  exposureEvents: number
  // THE headline: every distinct third party observed on the tab, named or
  // not. A party can appear in watching and blocked in the same tab only
  // until its seen-event is superseded by the block.
  watchingCompanies: number
  // Breakdown of watchingCompanies, kept visible for debugging: how many of
  // the observed third parties our DB has a source-backed name for, and how
  // many are observed but not yet codified.
  identifiedObservers: number
  unclassifiedParties: number
  // The privacy-trade subset (no-trade + ads-trade) of the source-backed set.
  privacyTradeObservers: number
  sourceBackedActiveObservers: number
  siteToolObservers: number
  blockedCompanies: number
  mitigatedCompanies: number
  cannotBlockSignals: number
  unclassifiedObservations: number
  persistenceObservations: number
  localPageSignals: number
  // The extension's own housekeeping events, reported only in diagnostics.
  diagnostics: number
  // Everything in storage for this tab, including diagnostics — the number
  // retention settings act on. Diagnostics-panel material, not a headline.
  storedEvents: number
}

export function summaryMetrics(summary: SiteSummary): SummaryMetrics {
  // One compaction pass, filtered per metric. Filtering compacted rows is
  // exactly equivalent to compacting a pre-filtered list: the merge key
  // includes event.source, so page-activity and extension-scan events can
  // never merge into one row (and diagnostics are skipped by compactEvents).
  const compacted = compactEvents(summary.events)

  return {
    observations: compacted.filter(({ event }) => isPageActivityEvent(event)).length,
    recordedEvents: summary.events.filter((event) => !isDiagnosticEvent(event) && !isExposureScanEvent(event)).length,
    exposureEvents: summary.events.filter((event) => isExposureScanEvent(event) && !isDiagnosticEvent(event)).length,
    watchingCompanies: countWatchingObservers(summary.events),
    identifiedObservers: countIdentifiedObservers(summary.events),
    unclassifiedParties: countUnclassifiedParties(summary.events),
    privacyTradeObservers: countPrivacyTradeObservers(summary.events),
    sourceBackedActiveObservers: countSourceBackedActiveObservers(summary.events),
    siteToolObservers: countSiteToolObservers(summary.events),
    blockedCompanies: summary.blockedCompanies.length,
    mitigatedCompanies: summary.mitigatedCompanies.length,
    cannotBlockSignals: summary.cannotBlockSignals.length,
    unclassifiedObservations: compacted.filter(({ event }) => isUnclassifiedObservation(event)).length,
    persistenceObservations: compacted.filter(({ event }) => isPersistenceSurfaceEvent(event)).length,
    localPageSignals: compacted.filter(({ event }) => isLocalPageSignalEvent(event)).length,
    diagnostics: summary.events.filter(isDiagnosticEvent).length,
    storedEvents: summary.events.length
  }
}
