import { validateTrackerDatabase } from "~core/db/validate"
import type { ObserverEvent } from "~core/domain/types"
import type { PerPersonValue } from "~core/contracts/schemas"

// Per-person value rollups per docs/TRACKER_VALUE_SPEC.md. Every tracker
// record embeds a perPersonValue block; this module answers, for a set of
// observed events: what was this visit worth, and what are you worth per
// year to the companies watching? Revenue (they monetize you) and cost (the
// site pays to track you) are reported separately — summing them into one
// number would conflate extraction with tooling spend.

export const MONETIZATION_FLOW_LABELS: Record<PerPersonValue["monetizationFlow"], string> = {
  platform_ads: "Ad platform revenue per user",
  programmatic: "Share of ad-auction economics",
  identity_infra: "Identity data licensing",
  operator_saas: "Tool paid for by the site"
}

export const VALUATION_DISCLAIMER =
  "Estimates from public revenue disclosures and industry CPM data, for an average US adult internet user across the whole web. Not measurements. Annual figures assume a year of ordinary exposure to each company, not this single visit."

let cachedByTrackerId: Map<string, PerPersonValue> | null = null

function perPersonValueByTrackerId(): Map<string, PerPersonValue> {
  if (!cachedByTrackerId) {
    cachedByTrackerId = new Map(validateTrackerDatabase().trackers.map((tracker) => [tracker.id, tracker.perPersonValue]))
  }
  return cachedByTrackerId
}

export function getTrackerValuation(trackerId: string | undefined): PerPersonValue | null {
  if (!trackerId) return null
  return perPersonValueByTrackerId().get(trackerId) ?? null
}

export type ValuationRollup = {
  perTracker: Array<{ trackerId: string; value: PerPersonValue }>
  // This visit, in dollars (sum of per-visit microdollars across observed trackers).
  thisVisitUsd: number
  // Annual value of you to companies that monetize you (valueType "revenue").
  annualRevenueLowUsd: number
  annualRevenueHighUsd: number
  annualRevenueMidpointUsd: number
  revenueTrackerCount: number
  // Annual amount sites pay to track you here (valueType "cost").
  annualOperatorCostLowUsd: number
  annualOperatorCostHighUsd: number
  costTrackerCount: number
  disclaimer: string
}

export function rollupObservedValuations(events: ObserverEvent[]): ValuationRollup {
  const trackerIds = new Set<string>()
  for (const event of events) if (event.trackerId) trackerIds.add(event.trackerId)

  const perTracker = [...trackerIds]
    .map((trackerId) => ({ trackerId, value: getTrackerValuation(trackerId) }))
    .filter((entry): entry is { trackerId: string; value: PerPersonValue } => entry.value !== null)
    .sort((left, right) => right.value.annual.high_usd - left.value.annual.high_usd)

  const revenue = perTracker.filter((entry) => entry.value.valueType === "revenue")
  const cost = perTracker.filter((entry) => entry.value.valueType === "cost")
  const sum = (entries: typeof perTracker, pick: (value: PerPersonValue) => number) =>
    entries.reduce((total, entry) => total + pick(entry.value), 0)

  const annualRevenueLowUsd = sum(revenue, (value) => value.annual.low_usd)
  const annualRevenueHighUsd = sum(revenue, (value) => value.annual.high_usd)
  return {
    perTracker,
    thisVisitUsd: sum(perTracker, (value) => value.perVisit.microdollars) / 1_000_000,
    annualRevenueLowUsd,
    annualRevenueHighUsd,
    annualRevenueMidpointUsd: (annualRevenueLowUsd + annualRevenueHighUsd) / 2,
    revenueTrackerCount: revenue.length,
    annualOperatorCostLowUsd: sum(cost, (value) => value.annual.low_usd),
    annualOperatorCostHighUsd: sum(cost, (value) => value.annual.high_usd),
    costTrackerCount: cost.length,
    disclaimer: VALUATION_DISCLAIMER
  }
}

export function formatUsd(value: number): string {
  if (value === 0) return "$0"
  if (value >= 1) return `$${Math.round(value).toLocaleString("en-US")}`
  if (value >= 0.01) return `$${value.toFixed(2)}`
  return `$${value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}`
}

export function formatUsdRange(low: number, high: number): string {
  return low === high ? formatUsd(low) : `${formatUsd(low)}–${formatUsd(high)}`
}
