import { compactEvents } from "~core/report/display"
import { isDiagnosticEvent, isExposureScanEvent } from "~core/state/summaries"
import type { SiteSummary } from "~core/domain/types"

// THE single source of truth for every headline number the popup, the
// report tab, and the copy payload display. Both surfaces read the same
// stored summary, but before this module each computed its own counts under
// the same labels — "Signals 3" on the report vs "Signals 26" in the popup
// for the same tab. Identical labels must mean identical math, so the math
// lives in exactly one place.

export type SummaryMetrics = {
  // Grouped observations: one per observer + signal combination. What a
  // user should read as "how many distinct things were seen".
  observations: number
  // Recorded page-activity events — excludes the extension's own
  // diagnostics AND the extension-run exposure scan, neither of which is
  // something the page did.
  recordedEvents: number
  // Extension-run exposure scan events (what Pulse could read locally).
  exposureEvents: number
  // Companies by outcome. A company can appear in watching and blocked in
  // the same tab only until its seen-event is superseded by the block.
  watchingCompanies: number
  blockedCompanies: number
  mitigatedCompanies: number
  cannotBlockSignals: number
  // The extension's own housekeeping events, reported only in diagnostics.
  diagnostics: number
  // Everything in storage for this tab, including diagnostics — the number
  // retention settings act on. Diagnostics-panel material, not a headline.
  storedEvents: number
}

export function summaryMetrics(summary: SiteSummary): SummaryMetrics {
  return {
    observations: compactEvents(summary.events).length,
    recordedEvents: summary.events.filter((event) => !isDiagnosticEvent(event) && !isExposureScanEvent(event)).length,
    exposureEvents: summary.events.filter((event) => isExposureScanEvent(event) && !isDiagnosticEvent(event)).length,
    watchingCompanies: summary.activeCompanies.length,
    blockedCompanies: summary.blockedCompanies.length,
    mitigatedCompanies: summary.mitigatedCompanies.length,
    cannotBlockSignals: summary.cannotBlockSignals.length,
    diagnostics: summary.events.filter(isDiagnosticEvent).length,
    storedEvents: summary.events.length
  }
}
