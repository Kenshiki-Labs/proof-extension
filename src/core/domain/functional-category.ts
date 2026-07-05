import { validateTrackerDatabase } from "~core/db/validate"
import { isThirdPartyObserverEvent, namedKey, partyKey } from "~core/domain/observer-counts"
import type { ObserverEvent } from "~core/domain/types"

// A Ghostery-style functional grouping (Advertising, Site Analytics, Consent
// Management, ...) for the SAME distinct-party count that drives "Watching" —
// this is a different axis from whoItServes (who benefits) and from
// supply-chain role (where the money flows). It answers "what kind of thing
// is this," which our tracker DB already records per-record as a free-text
// `category` (14 distinct values today) but never surfaced as a grouping.
// "unidentified" is not a DB category — it's assigned to any observed party
// with no tracker record, matching Ghostery's own "Unidentified" bucket for
// unmatched trackers.
export type FunctionalCategory =
  | "advertising"
  | "analytics"
  | "session_replay"
  | "identity_data"
  | "marketing_tools"
  | "consent_management"
  | "other"
  | "unidentified"

export const FUNCTIONAL_CATEGORY_LABELS: Record<FunctionalCategory, string> = {
  advertising: "Advertising",
  analytics: "Analytics",
  session_replay: "Session Replay",
  // "Data Brokers" not "Identity & Data Brokers": the longest chip label
  // sets the popup row's minimum width, and the longer form forced row
  // wrapping at 480px. Covers identity resolution, DMPs, CDPs, and
  // cross-device tracking — the full explanation lives in the report.
  identity_data: "Data Brokers",
  marketing_tools: "Marketing & Sales Tools",
  consent_management: "Consent Management",
  other: "Other",
  unidentified: "Unidentified"
}

// Maps the DB's free-text `category` field (see src/core/db/trackers.json)
// into the coarse buckets above. Deliberately explicit rather than a
// heuristic — a wrong bucket here is a silent mischaracterization of a real
// company, so a new raw category must be added here on purpose, not guessed.
const RAW_CATEGORY_TO_FUNCTIONAL: Record<string, FunctionalCategory> = {
  advertising: "advertising",
  analytics: "analytics",
  "product-analytics": "analytics",
  "performance-monitoring": "analytics",
  "session-replay": "session_replay",
  "behavioral-profiling": "identity_data",
  "identity-resolution": "identity_data",
  "customer-data-platform": "identity_data",
  "data-management-platform": "identity_data",
  "cross-device-tracking": "identity_data",
  "tag-manager": "marketing_tools",
  "consent-management": "consent_management",
  experimentation: "marketing_tools",
  "marketing-automation": "marketing_tools",
  "customer-messaging": "marketing_tools"
}

let cachedRawCategoryByTrackerId: Map<string, string> | null = null

function rawCategoryByTrackerId(): Map<string, string> {
  if (!cachedRawCategoryByTrackerId) {
    cachedRawCategoryByTrackerId = new Map(validateTrackerDatabase().trackers.map((tracker) => [tracker.id, tracker.category]))
  }
  return cachedRawCategoryByTrackerId
}

// "other" (not "unidentified") for a named tracker whose raw category isn't
// in the map above — it HAS a DB record, just not yet a bucket assignment.
// Conflating that with "unidentified" (no DB record at all) would be a
// factual error about what we actually know.
export function getFunctionalCategory(trackerId: string | undefined): FunctionalCategory {
  if (!trackerId) return "unidentified"
  const raw = rawCategoryByTrackerId().get(trackerId)
  if (!raw) return "unidentified"
  return RAW_CATEGORY_TO_FUNCTIONAL[raw] ?? "other"
}

// Distinct third parties grouped by function, not counted per-event — reuses
// isThirdPartyObserverEvent/partyKey from observer-counts.ts so the totals
// here always sum to exactly countWatchingObservers(events). Two independent
// re-derivations of "what counts as a watched party" is exactly the
// congruence bug this session spent all day fixing at the counting layer;
// this shares the one filter instead of writing a second copy of it.
export function countByFunctionalCategory(events: ObserverEvent[]): Partial<Record<FunctionalCategory, number>> {
  const categoryByPartyKey = new Map<string, FunctionalCategory>()
  for (const event of events) {
    if (!isThirdPartyObserverEvent(event)) continue
    const key = partyKey(event)
    if (!key) continue
    categoryByPartyKey.set(key, getFunctionalCategory(namedKey(event) ?? undefined))
  }

  const counts: Partial<Record<FunctionalCategory, number>> = {}
  for (const category of categoryByPartyKey.values()) {
    counts[category] = (counts[category] ?? 0) + 1
  }
  return counts
}

export type FunctionalCategoryBreakdownEntry = { category: FunctionalCategory; label: string; count: number }

export function functionalCategoryBreakdown(events: ObserverEvent[]): FunctionalCategoryBreakdownEntry[] {
  const counts = countByFunctionalCategory(events)
  return (Object.keys(counts) as FunctionalCategory[])
    .map((category) => ({ category, label: FUNCTIONAL_CATEGORY_LABELS[category], count: counts[category] ?? 0 }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}
