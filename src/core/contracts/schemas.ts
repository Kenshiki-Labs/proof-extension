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
    "extension_diagnostic",
    "browser_surface",
    "canvas_read",
    "audio_fingerprint",
    "webgl_query",
    "font_enumeration",
    "cookie_sync",
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

export const RuntimeMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("OBSERVED_EVENT"), payload: ObserverEventSchema }),
  z.object({ type: z.literal("PAGE_ERROR_OBSERVED"), payload: PageErrorSchema.omit({ id: true }) }),
  z.object({ type: z.literal("GET_SITE_SUMMARY"), tabId: z.number().int() }),
  z.object({ type: z.literal("SITE_SUMMARY"), payload: SiteSummarySchema }),
  z.object({ type: z.literal("REFRESH_TAB_SCAN"), tabId: z.number().int() }),
  z.object({ type: z.literal("GET_SETTINGS") }),
  z.object({ type: z.literal("SETTINGS"), payload: UserSettingsSchema }),
  z.object({ type: z.literal("UPDATE_SETTINGS"), payload: UserSettingsSchema.partial() }),
  z.object({ type: z.literal("CLEAR_LOCAL_DATA") })
])

export const TrackerSourceFamilySchema = z.enum([
  "manual_seed",
  "manual_fixture",
  "vendor_docs",
  "easyprivacy",
  "easylist",
  "duckduckgo_tracker_radar",
  "first_party_evidence"
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

export const TrackerRecordSchema = z.object({
  id: z.string().min(1),
  schemaVersion: z.number().int().positive(),
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
    method: z.string().min(1)
  }),
  confidence: DetectionConfidenceSchema,
  evidenceTemplate: z.array(z.string().min(1)).min(1),
  remediationId: z.string().min(1),
  sources: z.array(TrackerSourceSchema).min(1),
  review: TrackerReviewSchema
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