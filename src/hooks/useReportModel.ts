import { useMemo } from "react"

import { rankObservers } from "~core/domain/attention"
import { functionalCategoryBreakdown } from "~core/domain/functional-category"
import type { SiteSummary } from "~core/domain/types"
import { buildTabValuationEdges, buildUnclassifiedGraphEdges, rollupObservedValuations, rollupValuationOutcomes } from "~core/domain/valuation"
import { buildAtomicSignalRows, compactEvents, exposureScanEvents, localPageSignalObservations, persistenceSurfaceObservations } from "~core/report/display"
import { buildNarrowingModel } from "~core/report/narrowing"
import { buildWatcherGroups } from "~core/report/watchers"
import { domainForOrigin } from "~components/report/shared"

// Every derived view of the summary in one memo: these passes (ranking,
// compaction, grouping, graph edges) walk the full event stream, so they
// must not rerun on every unrelated state tick (copy flashes, lens
// switches) — only when the summary itself changes.
export function useReportModel(summary: SiteSummary) {
  return useMemo(() => {
    const observations = rankObservers(summary.events).map(({ observation }) => observation)
    const allObservations = compactEvents(summary.events.filter((event) => event.source !== "extension-scan"))
      .sort((left, right) => right.count - left.count || right.event.observedAt - left.event.observedAt)
    const localPageSignals = localPageSignalObservations(summary.events)
    const browserCookieObservations = compactEvents(summary.events.filter((event) => event.eventType === "cookie_observed" && event.source === "extension-scan"))
    const localStateObservations = persistenceSurfaceObservations(summary.events)
    const atomicSignalRows = buildAtomicSignalRows(summary.events)
    const exposureEvents = exposureScanEvents(summary.events)
    const watcherGroups = buildWatcherGroups(summary.events, summary.origin)
    // Honestly scoped to THIS page, unlike valuationRollup.edges (the
    // cross-site rolling ledger used by the Value tab) — the promoted graph
    // must show what it claims to show.
    const tabEdges = buildTabValuationEdges(summary.events, summary.origin)
    // Unclassified parties get a node too — a named-only graph silently
    // contradicts the "Watching" headline, which counts them already.
    const unclassifiedTabEdges = buildUnclassifiedGraphEdges(summary.events, summary.origin)
    const categoryBreakdown = functionalCategoryBreakdown(summary.events)
    const narrowingModel = buildNarrowingModel(summary.events)
    const siteDomain = domainForOrigin(summary.origin)
    const observedRollup = rollupObservedValuations(summary.events)
    const valuationOutcomes = rollupValuationOutcomes(summary.events)

    return {
      allObservations,
      atomicSignalRows,
      browserCookieObservations,
      categoryBreakdown,
      exposureEvents,
      localPageSignals,
      localStateObservations,
      narrowingModel,
      observations,
      observedRollup,
      siteDomain,
      tabEdges,
      unclassifiedTabEdges,
      valuationOutcomes,
      watcherGroups
    }
  }, [summary])
}

export type ReportModel = ReturnType<typeof useReportModel>
