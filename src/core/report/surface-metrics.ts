import type { SummaryMetrics } from "~core/report/metrics"

export type SummaryMetricField = keyof SummaryMetrics

export type SurfaceMetricDefinition = {
  field: SummaryMetricField
  label: string
  title: string
}

// The debug view's fail-open catalog: every SummaryMetrics field, with its
// meaning, in reading order. Product surfaces (popup, report) render NO
// metric tiles per docs/surface-contract.md — their numbers arrive through
// the verdict sentence, the watcher list, and the acts' own prose. This
// catalog exists so the debug surface can show the whole pipeline with
// definitions attached; the test asserts it covers every field, so a new
// metric cannot be added without also being observable.
export const DEBUG_METRICS = [
  { field: "watchingCompanies", label: "Watching", title: "Every distinct third party observed on this tab — named plus not-yet-classified" },
  { field: "identifiedObservers", label: "Identified", title: "Observed third parties our DB has a source-backed name for" },
  { field: "unclassifiedParties", label: "Not classified", title: "Distinct third parties observed but not yet codified in our tracker DB" },
  { field: "privacyTradeObservers", label: "Privacy-trade", title: "Source-backed active observers in the no-trade or ads-trade categories" },
  { field: "sourceBackedActiveObservers", label: "Source-backed", title: "Active classified observers backed by tracker intelligence" },
  { field: "siteToolObservers", label: "Site tools", title: "Active source-backed observers categorized as site tools" },
  { field: "blockedCompanies", label: "Blocked", title: "Companies actually blocked by a rule you enabled — nothing blocks by default" },
  { field: "mitigatedCompanies", label: "Mitigated", title: "Companies whose collection was degraded by an enabled mitigation" },
  { field: "cannotBlockSignals", label: "Can't block", title: "Signal types no browser tool can block at all" },
  { field: "observations", label: "Observations", title: "Grouped page observations: one row per observer and signal" },
  { field: "recordedEvents", label: "Events", title: "Raw page-activity events recorded on this tab, excluding extension diagnostics" },
  { field: "storedEvents", label: "Stored events", title: "All events retained for this tab, including diagnostics — what the per-tab cap acts on" },
  { field: "unclassifiedObservations", label: "Unclassified rows", title: "Grouped third-party observations not yet attributed to tracker records" },
  { field: "persistenceObservations", label: "Storage rows", title: "Grouped browser storage and cache observations" },
  { field: "localPageSignals", label: "Local page signals", title: "Consent plumbing and identity-digest preparation observed in the page itself" },
  { field: "exposureEvents", label: "Exposure scan", title: "Extension-run exposure scan events (what Pulse could read locally)" },
  { field: "diagnostics", label: "Diagnostics", title: "Extension housekeeping events" }
] as const satisfies readonly SurfaceMetricDefinition[]

export function metricItems(metrics: SummaryMetrics, definitions: readonly SurfaceMetricDefinition[]) {
  return definitions.map((definition) => ({
    ...definition,
    value: metrics[definition.field]
  }))
}
