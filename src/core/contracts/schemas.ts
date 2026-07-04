import * as z from "zod"

export const BlockabilityClassSchema = z.enum([
  "network_blockable",
  "content_mitigatable",
  "observable_only",
  "pre_request_unblockable",
  "server_side_unblockable",
  "user_action_required"
])

export const ObservationStatusSchema = z.enum(["active", "blocked", "mitigated", "cannot_block"])
export const DetectionConfidenceSchema = z.enum(["confirmed", "probable", "weak"])

export const FirstPartyPolicyLabelSchema = z.enum([
  "site_functionality",
  "security_or_fraud",
  "analytics",
  "fingerprinting",
  "behavioral_profiling",
  "unknown_first_party"
])

export const ObserverEventSchema = z.object({
  id: z.string().min(1),
  tabId: z.number().int(),
  frameId: z.number().int().optional(),
  origin: z.string().min(1),
  observedAt: z.number().int().nonnegative(),
  source: z.enum(["network", "content", "api-hook", "extension-scan"]),
  trackerId: z.string().min(1).optional(),
  companyId: z.string().min(1).optional(),
  firstParty: z.boolean(),
  policyLabel: FirstPartyPolicyLabelSchema.optional(),
  eventType: z.enum([
    "request_seen",
    "request_blocked",
    "script_injected",
    "sdk_detected",
    "extension_diagnostic",
    "browser_surface",
    "canvas_read",
    "audio_fingerprint",
    "webgl_query",
    "font_enumeration",
    "cookie_sync",
    "cookie_observed",
    "storage_write",
    "indexeddb_access",
    "cache_storage_access",
    "service_worker_registered",
    "webrtc_probe"
  ]),
  blockability: BlockabilityClassSchema,
  status: ObservationStatusSchema,
  confidence: DetectionConfidenceSchema,
  evidence: z.array(z.string().min(1)).min(1),
  count: z.number().int().positive().optional(),
  details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional()
})

export const PageErrorSchema = z.object({
  id: z.string().min(1),
  observedAt: z.number().int().nonnegative(),
  message: z.string().min(1),
  stackPreview: z.string().optional()
})

export const SiteSummarySchema = z.object({
  origin: z.string().min(1),
  tabId: z.number().int(),
  activeCompanies: z.array(z.string()),
  blockedCompanies: z.array(z.string()),
  mitigatedCompanies: z.array(z.string()),
  exposedSignals: z.array(z.string()),
  cannotBlockSignals: z.array(z.string()),
  events: z.array(ObserverEventSchema),
  pageErrors: z.array(PageErrorSchema),
  incomplete: z.boolean(),
  updatedAt: z.number().int().nonnegative()
})

export const UserSettingsSchema = z.object({
  retentionDays: z.number().int().min(1).max(365),
  maxEventsPerTab: z.number().int().min(1).max(500),
  // This is primarily an observer, not a blocker — network blocking is
  // opt-in and per-tracker, chosen right where the tracker is observed (the
  // popup), not a single global switch. Empty by default, so nothing
  // changes site behavior until the user opts a specific tracker in.
  blockedTrackerIds: z.array(z.string().min(1)),
  mitigateCanvas: z.boolean(),
  mitigateAudio: z.boolean(),
  mitigateWebgl: z.boolean(),
  skipReportOpenConfirm: z.boolean()
})

export const ValuationPeriodSchema = z.enum(["day", "week", "month", "all"])

const MonetizationFlowSchema = z.enum(["platform_ads", "programmatic", "identity_infra", "operator_saas"])
const EmptyValuationFlowRollups = MonetizationFlowSchema.options.map((flow) => ({
  flow,
  trackerCount: 0,
  observations: 0,
  thisPeriodVisitUsd: 0,
  annualLowUsd: 0,
  annualHighUsd: 0
}))

export const ValuationSnapshotSchema = z.object({
  sourceFindingIds: z.array(z.string().min(1)).min(1),
  valueType: z.enum(["revenue", "cost"]),
  monetizationFlow: MonetizationFlowSchema,
  perVisitMicrodollars: z.number().min(0),
  annualLowUsd: z.number().min(0),
  annualHighUsd: z.number().min(0),
  confidence: z.enum(["sourced", "estimated"])
})

const DayKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const SiteVisitLedgerEntrySchema = z.object({
  day: DayKeySchema,
  visitId: z.string().min(1),
  siteOrigin: z.string().min(1),
  firstVisitedAt: z.number().int().nonnegative(),
  lastVisitedAt: z.number().int().nonnegative(),
  visits: z.number().int().positive()
})

export const TrackerPresenceLedgerEntrySchema = z.object({
  day: DayKeySchema,
  visitId: z.string().min(1),
  siteOrigin: z.string().min(1),
  trackerId: z.string().min(1),
  companyId: z.string().min(1).optional(),
  firstObservedAt: z.number().int().nonnegative(),
  lastObservedAt: z.number().int().nonnegative(),
  observations: z.number().int().positive(),
  pageVisitsWithTracker: z.number().int().positive(),
  valuation: ValuationSnapshotSchema
})

export const ValuationLedgerSchema = z.object({
  schemaVersion: z.literal(1),
  siteVisits: z.array(SiteVisitLedgerEntrySchema),
  trackerPresence: z.array(TrackerPresenceLedgerEntrySchema)
})

export const RollingValuationItemSchema = z.object({
  id: z.string().min(1),
  siteCount: z.number().int().nonnegative().optional(),
  visitCount: z.number().int().nonnegative().optional(),
  trackerCount: z.number().int().nonnegative().optional(),
  observations: z.number().int().nonnegative(),
  thisPeriodVisitUsd: z.number().nonnegative(),
  annualLowUsd: z.number().nonnegative().optional(),
  annualHighUsd: z.number().nonnegative().optional()
})

export const ValuationFlowRollupSchema = z.object({
  flow: MonetizationFlowSchema,
  trackerCount: z.number().int().nonnegative(),
  observations: z.number().int().nonnegative(),
  thisPeriodVisitUsd: z.number().nonnegative(),
  annualLowUsd: z.number().nonnegative(),
  annualHighUsd: z.number().nonnegative()
})

export const RollingValuationSummarySchema = z.object({
  period: ValuationPeriodSchema,
  siteCount: z.number().int().nonnegative(),
  visitCount: z.number().int().nonnegative(),
  trackerCount: z.number().int().nonnegative(),
  observations: z.number().int().nonnegative(),
  thisPeriodVisitUsd: z.number().nonnegative(),
  annualRevenueLowUsd: z.number().nonnegative(),
  annualRevenueHighUsd: z.number().nonnegative(),
  revenueTrackerCount: z.number().int().nonnegative(),
  annualOperatorCostLowUsd: z.number().nonnegative(),
  annualOperatorCostHighUsd: z.number().nonnegative(),
  costTrackerCount: z.number().int().nonnegative(),
  flowRollups: z.array(ValuationFlowRollupSchema).default(EmptyValuationFlowRollups),
  topTrackers: z.array(RollingValuationItemSchema),
  topSites: z.array(RollingValuationItemSchema),
  edges: z.array(
    z.object({
      siteOrigin: z.string().min(1),
      trackerId: z.string().min(1),
      observations: z.number().int().nonnegative(),
      thisPeriodVisitUsd: z.number().min(0),
      servesCategory: z.enum(["you_and_the_site", "the_site", "advertisers_and_maybe_you", "only_their_business"])
    })
  ).default([]),
  servesCounts: z.object({
    you_and_the_site: z.number().int().nonnegative(),
    the_site: z.number().int().nonnegative(),
    advertisers_and_maybe_you: z.number().int().nonnegative(),
    only_their_business: z.number().int().nonnegative()
  }).default({ you_and_the_site: 0, the_site: 0, advertisers_and_maybe_you: 0, only_their_business: 0 }),
  onlyTheirBusinessAnnualLowUsd: z.number().min(0).default(0),
  onlyTheirBusinessAnnualHighUsd: z.number().min(0).default(0),
  disclaimer: z.string().min(1)
})

export const RuntimeMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("OBSERVED_EVENT"), payload: ObserverEventSchema }),
  z.object({ type: z.literal("PAGE_ERROR_OBSERVED"), payload: PageErrorSchema.omit({ id: true }) }),
  z.object({ type: z.literal("GET_SITE_SUMMARY"), tabId: z.number().int() }),
  z.object({ type: z.literal("SITE_SUMMARY"), payload: SiteSummarySchema }),
  z.object({ type: z.literal("GET_VALUATION_ROLLUP"), period: ValuationPeriodSchema }),
  z.object({ type: z.literal("VALUATION_ROLLUP"), payload: RollingValuationSummarySchema }),
  z.object({ type: z.literal("REFRESH_TAB_SCAN"), tabId: z.number().int() }),
  z.object({ type: z.literal("GET_SETTINGS") }),
  z.object({ type: z.literal("SETTINGS"), payload: UserSettingsSchema }),
  z.object({ type: z.literal("UPDATE_SETTINGS"), payload: UserSettingsSchema.partial() }),
  z.object({ type: z.literal("CLEAR_VALUATION_LEDGER") }),
  z.object({ type: z.literal("CLEAR_LOCAL_DATA") })
])

export const TrackerSourceFamilySchema = z.enum([
  "manual_seed",
  "manual_fixture",
  "vendor_docs",
  "easyprivacy",
  "easylist",
  "duckduckgo_tracker_radar",
  "first_party_evidence",
  // US state data-broker registry filings (Vermont, Oregon, Texas,
  // California AG/CPPA) — public-record provenance for remediation data.
  "state_registry",
  // Curated market/economic research used only to support per-person
  // valuation estimates. This does not prove tracker identity, collection,
  // or blocking behavior.
  "market_research",
  // Kenshiki-authored defense registry (defense-registry.v3-harm) and
  // supply-chain research; first-party curated remediation intelligence.
  "kenshiki_defense_registry",
  // Kenshiki-authored identity join index across runtime DB records,
  // normalized registries, and remediation/defense destinations.
  "kenshiki_entity_index"
])

export const TrackerSourceSchema = z.object({
  family: TrackerSourceFamilySchema,
  name: z.string().min(1),
  url: z.url().optional(),
  version: z.string().min(1).optional(),
  retrieved_at: z.iso.date().optional(),
  license: z.string().min(1),
  transform_notes: z.string().min(1)
})

export const TrackerReviewSchema = z.object({
  status: z.enum(["seed", "source_backed", "false_positive_review", "deprecated"]),
  last_reviewed_at: z.iso.date(),
  reviewer: z.string().min(1),
  notes: z.string().min(1)
})

export const TrackerObservationProfileSchema = z.object({
  browserVisible: z.array(z.string().min(1)).default([]),
  siteProvided: z.array(z.string().min(1)).default([]),
  notVisibleToExtension: z.array(z.string().min(1)).default([])
})

export const TrackerUserImpactSchema = z.object({
  plainSummary: z.string().min(1).optional(),
  whyItMatters: z.array(z.string().min(1)).default([]),
  riskLevel: z.enum(["low", "medium", "high"]).optional(),
  riskReasons: z.array(z.string().min(1)).default([])
})

// Per-person economic value (docs/TRACKER_VALUE_SPEC.md): what one person's
// data is worth to this company, per visit and per year. valueType "revenue"
// means the tracker company monetizes the user; "cost" means the site pays
// to track. Estimates, never measurements — confidence is explicit.
export const PerPersonValueSchema = z.object({
  schemaVersion: z.literal(1),
  currency: z.literal("USD"),
  geography: z.literal("US"),
  userProfile: z.string().min(1),
  valueType: z.enum(["revenue", "cost"]),
  monetizationFlow: z.enum(["platform_ads", "programmatic", "identity_infra", "operator_saas"]),
  perVisit: z.object({
    microdollars: z.number().min(0),
    dollars: z.number().min(0),
    basis: z.string().min(1)
  }),
  annual: z.object({
    low_usd: z.number().min(0),
    high_usd: z.number().min(0),
    midpoint_usd: z.number().min(0)
  }),
  valueNote: z.string().min(1),
  sourceNote: z.string().min(1),
  sourceFindingIds: z.array(z.string().min(1)).min(1),
  lastUpdated: z.iso.date(),
  confidence: z.enum(["sourced", "estimated"])
})

export type PerPersonValue = z.infer<typeof PerPersonValueSchema>

export const TrackerRecordSchema = z.object({
  id: z.string().min(1),
  schemaVersion: z.number().int().positive(),
  displayName: z.string().min(1).optional(),
  match: z.object({
    domains: z.array(z.string().min(1)).default([]),
    paths: z.array(z.string().min(1)).default([]),
    requestTypes: z.array(z.string().min(1)).default([])
  }),
  companyId: z.string().min(1),
  category: z.string().min(1),
  collects: z.array(z.string().min(1)).min(1),
  monetization: z.array(z.string().min(1)).min(1),
  browserAction: z.object({
    blockability: BlockabilityClassSchema,
    method: z.string().min(1),
    // Whether blocking this tracker's network requests can break visible
    // site functionality (chat widgets, forms, tag delivery). "high" means
    // the UI must not offer a block toggle at all — observation only.
    siteBreakage: z.object({
      risk: z.enum(["low", "medium", "high"]),
      affects: z.array(z.string().min(1)),
      note: z.string().min(1)
    }),
    whatBlockingChanges: z.array(z.string().min(1)).default([]),
    whatBlockingDoesNotChange: z.array(z.string().min(1)).default([])
  }),
  observes: TrackerObservationProfileSchema.optional(),
  userImpact: TrackerUserImpactSchema.optional(),
  confidence: DetectionConfidenceSchema,
  evidenceTemplate: z.array(z.string().min(1)).min(1),
  remediationId: z.string().min(1),
  sources: z.array(TrackerSourceSchema).min(1),
  review: TrackerReviewSchema,
  perPersonValue: PerPersonValueSchema,
  // Position in the ad-money supply chain, from raw behavioral events to
  // the ad you see. site_tooling sits outside the ad-money rail (the site
  // pays it); vertically_integrated owns every stage (Google/Amazon/Meta).
  supplyChainRole: z.enum([
    "mine_infrastructure",
    "concentrator",
    "refinery",
    "parts_supplier",
    "assembly",
    "wholesale",
    "retail_shelf",
    "vertically_integrated",
    "site_tooling"
  ]),
  // Who this tracker actually serves — the user-benefit axis. A heatmap
  // tool and an identity broker both "track"; this field is what separates
  // them honestly in the UI.
  whoItServes: z.object({
    category: z.enum(["you_and_the_site", "the_site", "advertisers_and_maybe_you", "only_their_business"]),
    note: z.string().min(1)
  })
})

export type TrackerSource = z.infer<typeof TrackerSourceSchema>
export type TrackerReview = z.infer<typeof TrackerReviewSchema>
export type TrackerRecord = z.infer<typeof TrackerRecordSchema>

export const CompanyRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  parentCompany: z.string().min(1),
  aliases: z.array(z.string().min(1)),
  categoryLabels: z.array(z.string().min(1)),
  jurisdiction: z.string().min(1).optional(),
  privacyContact: z.string().min(1).optional()
})

export const RemediationRecordSchema = z.object({
  id: z.string().min(1),
  future_collection_url: z.url(),
  deletion_url: z.url(),
  identity_verification_required: z.boolean(),
  estimated_time_minutes: z.number().int().nonnegative(),
  recheck_interval_days: z.number().int().positive(),
  friction_class: z.enum(["low", "medium", "high", "unknown"]),
  notes: z.string().min(1),
  jurisdiction_notes: z.string().min(1),
  last_verified_at: z.iso.date()
})

export const TrackerDatabaseSchema = z.array(TrackerRecordSchema)
export const CompanyDatabaseSchema = z.array(CompanyRecordSchema)
export const RemediationDatabaseSchema = z.array(RemediationRecordSchema)