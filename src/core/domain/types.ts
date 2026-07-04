export type BlockabilityClass =
  | "network_blockable"
  | "content_mitigatable"
  | "observable_only"
  | "pre_request_unblockable"
  | "server_side_unblockable"
  | "user_action_required"

export type ObservationStatus = "active" | "blocked" | "mitigated" | "cannot_block"

export type DetectionConfidence = "confirmed" | "probable" | "weak"

export type FirstPartyPolicyLabel =
  | "site_functionality"
  | "security_or_fraud"
  | "analytics"
  | "fingerprinting"
  | "behavioral_profiling"
  | "unknown_first_party"

export type ObserverEvent = {
  id: string
  tabId: number
  frameId?: number | undefined
  origin: string
  observedAt: number
  source: "network" | "content" | "api-hook" | "extension-scan"
  trackerId?: string | undefined
  companyId?: string | undefined
  firstParty: boolean
  policyLabel?: FirstPartyPolicyLabel | undefined
  eventType:
    | "request_seen"
    | "request_blocked"
    | "script_injected"
    // A vendor SDK global (window.fbq, window.FS, …) present in the page.
    // Catches trackers whose network requests were cached, first-party
    // proxied, or CNAME-cloaked and therefore invisible to request matching.
    | "sdk_detected"
    // The extension reporting on itself (bridge ready, hooks installed, scan
    // attempts) — never an observation of page behavior. Kept separate so
    // script_injected stays reserved for real dynamic-script detection.
    | "extension_diagnostic"
    | "browser_surface"
    | "canvas_read"
    | "audio_fingerprint"
    | "webgl_query"
    | "font_enumeration"
    | "cookie_sync"
    // Persistence surfaces (JS-visible subset): metadata-only observations of
    // storage the page wrote — names, sizes, timing; never values. The
    // cache_validator_seen and storage_respawn_suspected families from the
    // spec are deliberately absent until an emitter exists: a schema that
    // accepts a type nothing emits is pure forgery surface.
    | "cookie_observed"
    | "storage_write"
    | "indexeddb_access"
    | "cache_storage_access"
    | "service_worker_registered"
    | "webrtc_probe"
  blockability: BlockabilityClass
  status: ObservationStatus
  confidence: DetectionConfidence
  evidence: string[]
  // How many times this observation recurred; merged by upsertEvent when an
  // event with the same id is recorded again. Absent means 1.
  count?: number | undefined
  details?: Record<string, string | number | boolean> | undefined
}

// A page-level uncaught error observed while this extension was active on
// the tab. Correlation, not causation — the spec bans false certainty, and
// attributing a page error to our own hooks vs. a pre-existing site bug is
// not reliably knowable from a stack trace alone. The point is to never stay
// silent if the page might have broken while we were running on it.
export type PageError = {
  id: string
  observedAt: number
  message: string
  stackPreview?: string | undefined
}

export type SiteSummary = {
  origin: string
  tabId: number
  activeCompanies: string[]
  blockedCompanies: string[]
  mitigatedCompanies: string[]
  exposedSignals: string[]
  cannotBlockSignals: string[]
  events: ObserverEvent[]
  pageErrors: PageError[]
  incomplete: boolean
  updatedAt: number
}

export type UserSettings = {
  retentionDays: number
  maxEventsPerTab: number
  blockedTrackerIds: string[]
  mitigateCanvas: boolean
  mitigateAudio: boolean
  mitigateWebgl: boolean
  skipReportOpenConfirm: boolean
}

export type ValuationPeriod = "day" | "week" | "month" | "all"

export type MonetizationFlow = "platform_ads" | "programmatic" | "identity_infra" | "operator_saas"

export type ValuationSnapshot = {
  sourceFindingIds: string[]
  valueType: "revenue" | "cost"
  monetizationFlow: MonetizationFlow
  perVisitMicrodollars: number
  annualLowUsd: number
  annualHighUsd: number
  confidence: "sourced" | "estimated"
}

export type SiteVisitLedgerEntry = {
  day: string
  visitId: string
  siteOrigin: string
  firstVisitedAt: number
  lastVisitedAt: number
  visits: number
}

export type TrackerPresenceLedgerEntry = {
  day: string
  visitId: string
  siteOrigin: string
  trackerId: string
  companyId?: string | undefined
  firstObservedAt: number
  lastObservedAt: number
  observations: number
  pageVisitsWithTracker: number
  valuation: ValuationSnapshot
}

export type ValuationLedger = {
  schemaVersion: 1
  siteVisits: SiteVisitLedgerEntry[]
  trackerPresence: TrackerPresenceLedgerEntry[]
}

export type RollingValuationItem = {
  id: string
  siteCount?: number | undefined
  visitCount?: number | undefined
  trackerCount?: number | undefined
  observations: number
  thisPeriodVisitUsd: number
  annualLowUsd?: number | undefined
  annualHighUsd?: number | undefined
}

export type ValuationFlowRollup = {
  flow: MonetizationFlow
  trackerCount: number
  observations: number
  thisPeriodVisitUsd: number
  annualLowUsd: number
  annualHighUsd: number
}

// One site↔tracker connection in the selected period — the edge list that
// powers the network graph. servesCategory colors the edge by who the
// tracker actually serves.
export type ValuationEdge = {
  siteOrigin: string
  trackerId: string
  observations: number
  thisPeriodVisitUsd: number
  servesCategory: "you_and_the_site" | "the_site" | "advertisers_and_maybe_you" | "only_their_business"
}

export type RollingValuationSummary = {
  period: ValuationPeriod
  siteCount: number
  visitCount: number
  trackerCount: number
  observations: number
  thisPeriodVisitUsd: number
  annualRevenueLowUsd: number
  annualRevenueHighUsd: number
  revenueTrackerCount: number
  annualOperatorCostLowUsd: number
  annualOperatorCostHighUsd: number
  costTrackerCount: number
  flowRollups: ValuationFlowRollup[]
  topTrackers: RollingValuationItem[]
  topSites: RollingValuationItem[]
  edges: ValuationEdge[]
  servesCounts: Record<ValuationEdge["servesCategory"], number>
  onlyTheirBusinessAnnualLowUsd: number
  onlyTheirBusinessAnnualHighUsd: number
  disclaimer: string
}

export type RuntimeMessage =
  | { type: "OBSERVED_EVENT"; payload: ObserverEvent }
  | { type: "PAGE_ERROR_OBSERVED"; payload: Omit<PageError, "id"> }
  | { type: "GET_SITE_SUMMARY"; tabId: number }
  | { type: "SITE_SUMMARY"; payload: SiteSummary }
  | { type: "GET_VALUATION_ROLLUP"; period: ValuationPeriod }
  | { type: "VALUATION_ROLLUP"; payload: RollingValuationSummary }
  | { type: "REFRESH_TAB_SCAN"; tabId: number }
  | { type: "GET_SETTINGS" }
  | { type: "SETTINGS"; payload: UserSettings }
  | { type: "UPDATE_SETTINGS"; payload: Partial<UserSettings> }
  | { type: "CLEAR_VALUATION_LEDGER" }
  | { type: "CLEAR_LOCAL_DATA" }