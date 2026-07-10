import type * as z from "zod"

import type { RuntimeMessageSchema } from "~core/contracts/messages"

import type {
  BlockabilityClassSchema,
  CookieMetadataScanResultSchema,
  CookieValueInspectResultSchema,
  DetectionConfidenceSchema,
  EvidenceTierSchema,
  FirstPartyPolicyLabelSchema,
  MonetizationFlowSchema,
  ObservationStatusSchema,
  ObserverEventSchema,
  PageErrorSchema,
  RollingValuationItemSchema,
  RollingValuationSummarySchema,
  SiteSummarySchema,
  SiteVisitLedgerEntrySchema,
  TrackerPresenceLedgerEntrySchema,
  UserSettingsSchema,
  ValuationFlowRollupSchema,
  ValuationLedgerSchema,
  ValuationPeriodSchema,
  ValuationSnapshotSchema
} from "~core/contracts/schemas"

// Every runtime-validated shape is derived (z.infer) from its zod schema in
// ~core/contracts/schemas — the schema is the single source of truth, and a
// schema edit updates the type in the same commit or fails typecheck. Only
// shapes with no schema (UnclassifiedGraphEdge and the derived aliases) are
// declared by hand here. Imports are type-only, so this module stays free of
// runtime dependencies.

export type BlockabilityClass = z.infer<typeof BlockabilityClassSchema>

export type ObservationStatus = z.infer<typeof ObservationStatusSchema>

export type DetectionConfidence = z.infer<typeof DetectionConfidenceSchema>

export type EvidenceTier = z.infer<typeof EvidenceTierSchema>

export type FirstPartyPolicyLabel = z.infer<typeof FirstPartyPolicyLabelSchema>

// The eventType union (and its documentation) lives on OBSERVER_EVENT_TYPES
// in ~core/contracts/schemas.
export type ObserverEvent = z.infer<typeof ObserverEventSchema>

// A page-level uncaught error observed while this extension was active on
// the tab. Correlation, not causation — the spec bans false certainty, and
// attributing a page error to our own hooks vs. a pre-existing site bug is
// not reliably knowable from a stack trace alone. The point is to never stay
// silent if the page might have broken while we were running on it.
export type PageError = z.infer<typeof PageErrorSchema>

export type SiteSummary = z.infer<typeof SiteSummarySchema>

export type CookieMetadataScanResult = z.infer<typeof CookieMetadataScanResultSchema>

export type CookieMetadataScanStatus = CookieMetadataScanResult["status"]

export type CookieValueInspectResult = z.infer<typeof CookieValueInspectResultSchema>

export type CookieValueInspectEntry = CookieValueInspectResult["cookies"][number]

// Includes siteVisitFrequency: the user's stated visit rate per registrable
// domain ("How often are you here?") — calibrates the annual value line.
// Absent domain = not asked yet.
export type UserSettings = z.infer<typeof UserSettingsSchema>

export type ValuationPeriod = z.infer<typeof ValuationPeriodSchema>

export type MonetizationFlow = z.infer<typeof MonetizationFlowSchema>

export type ValuationSnapshot = z.infer<typeof ValuationSnapshotSchema>

export type SiteVisitLedgerEntry = z.infer<typeof SiteVisitLedgerEntrySchema>

export type TrackerPresenceLedgerEntry = z.infer<typeof TrackerPresenceLedgerEntrySchema>

export type ValuationLedger = z.infer<typeof ValuationLedgerSchema>

export type RollingValuationItem = z.infer<typeof RollingValuationItemSchema>

export type ValuationFlowRollup = z.infer<typeof ValuationFlowRollupSchema>

export type RollingValuationSummary = z.infer<typeof RollingValuationSummarySchema>

// One site↔tracker connection in the selected period — the edge list that
// powers the network graph. servesCategory colors the edge by who the
// tracker actually serves.
export type ValuationEdge = RollingValuationSummary["edges"][number]

// A site↔host connection the graph can show but cannot price or name — an
// observed third party with no tracker-DB match. Kept as a separate type
// (not a loosened ValuationEdge) because "unclassified" is a presentation
// fact, not a valuation fact: it never carries a servesCategory or a price,
// and must never be persisted into the valuation ledger as if it were one.
// No schema exists for it — it is never parsed at a trust boundary — so it
// stays hand-written.
export type UnclassifiedGraphEdge = {
  siteOrigin: string
  host: string
  observations: number
}

type InferredRuntimeMessage = z.infer<typeof RuntimeMessageSchema>

// Derived from the schema except for one member: UserSettingsSchema.partial()
// infers `retentionDays?: number | undefined` (and friends), which
// exactOptionalPropertyTypes treats as a wider shape than Partial<UserSettings>.
// Consumers spread the payload over full settings, so the narrower Partial
// contract is kept for UPDATE_SETTINGS.
export type RuntimeMessage =
  | Exclude<InferredRuntimeMessage, { type: "UPDATE_SETTINGS" }>
  | { type: "UPDATE_SETTINGS"; payload: Partial<UserSettings> }
