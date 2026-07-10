import { validateTrackerDatabase } from "~core/db/validate"
import { hostForEvent, registrableDomain } from "~core/domain/party"
import { isUnclassifiedObservation } from "~core/state/summaries"
import type { ObserverEvent, UnclassifiedGraphEdge, ValuationEdge } from "~core/domain/types"
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

export type ServesCategory = "you_and_the_site" | "the_site" | "advertisers_and_maybe_you" | "only_their_business"

export const SERVES_LABELS: Record<ServesCategory, string> = {
  you_and_the_site: "A feature you use",
  the_site: "Works for the site",
  advertisers_and_maybe_you: "Ads — relevance is the claimed trade",
  only_their_business: "Only their business"
}

let cachedServes: Map<string, { category: ServesCategory; note: string }> | null = null

function servesByTrackerId() {
  if (!cachedServes) {
    cachedServes = new Map(validateTrackerDatabase().trackers.map((tracker) => [tracker.id, tracker.whoItServes]))
  }
  return cachedServes
}

export function getTrackerServes(trackerId: string | undefined): { category: ServesCategory; note: string } | null {
  if (!trackerId) return null
  return servesByTrackerId().get(trackerId) ?? null
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
  // The user-benefit slice: how many observed trackers serve you, the site,
  // or only themselves — and what the only-their-business subset is worth.
  servesCounts: Record<ServesCategory, number>
  onlyTheirBusinessAnnualLowUsd: number
  onlyTheirBusinessAnnualHighUsd: number
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
  const servesCounts: Record<ServesCategory, number> = {
    you_and_the_site: 0,
    the_site: 0,
    advertisers_and_maybe_you: 0,
    only_their_business: 0
  }
  let onlyTheirBusinessAnnualLowUsd = 0
  let onlyTheirBusinessAnnualHighUsd = 0
  for (const entry of perTracker) {
    const serves = getTrackerServes(entry.trackerId)
    if (!serves) continue
    servesCounts[serves.category] += 1
    if (serves.category === "only_their_business") {
      onlyTheirBusinessAnnualLowUsd += entry.value.annual.low_usd
      onlyTheirBusinessAnnualHighUsd += entry.value.annual.high_usd
    }
  }
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
    servesCounts,
    onlyTheirBusinessAnnualLowUsd,
    onlyTheirBusinessAnnualHighUsd,
    disclaimer: VALUATION_DISCLAIMER
  }
}

// Where a tracker's value actually went this visit, judged per tracker from
// the statuses of its own events:
// - "reached":  at least one request got through unimpeded (active or
//               cannot_block) — its value counts as extracted, even if other
//               requests from it were blocked. Worst case is the honest case.
// - "shimmed":  nothing reached it for real, but a page-safe shim answered
//               (status mitigated) — it got a request, not data.
// - "denied":   every one of its requests was deterministically blocked.
// A tracker only lands in a bucket via statuses the background can prove;
// "blocked" is only ever set from deterministic block signals.
export type TrackerOutcome = "reached" | "shimmed" | "denied"

export type OutcomeBucket = {
  trackerIds: string[]
  // This visit, in dollars (sum of per-visit microdollars for the bucket).
  thisVisitUsd: number
  annualLowUsd: number
  annualHighUsd: number
  // Revenue-type value only (companies monetizing the user). Personal claims
  // ("stayed with you", "denied by your blocks") must use these: cost-type
  // trackers are fees the SITE pays — blocking one saves the site money, not
  // the user, and folding it into a "your value" figure overclaims.
  thisVisitRevenueUsd: number
  annualRevenueLowUsd: number
  annualRevenueHighUsd: number
  costTrackerCount: number
  // Requests whose own status matches this bucket's outcome — a mixed-status
  // tracker's blocked requests never count as "answered locally" just
  // because the tracker landed in the shimmed bucket.
  requestCount: number
}

export type ValuationOutcomeRollup = {
  reached: OutcomeBucket
  shimmed: OutcomeBucket
  denied: OutcomeBucket
  disclaimer: string
}

function emptyOutcomeBucket(): OutcomeBucket {
  return {
    trackerIds: [],
    thisVisitUsd: 0,
    annualLowUsd: 0,
    annualHighUsd: 0,
    thisVisitRevenueUsd: 0,
    annualRevenueLowUsd: 0,
    annualRevenueHighUsd: 0,
    costTrackerCount: 0,
    requestCount: 0
  }
}

function statusOutcomeClass(status: ObserverEvent["status"]): TrackerOutcome {
  if (status === "blocked") return "denied"
  if (status === "mitigated") return "shimmed"
  return "reached"
}

export function rollupValuationOutcomes(events: ObserverEvent[]): ValuationOutcomeRollup {
  const statusesByTracker = new Map<string, Set<ObserverEvent["status"]>>()
  const requestsByTrackerByClass = new Map<string, Record<TrackerOutcome, number>>()
  for (const event of events) {
    if (!event.trackerId) continue
    const statuses = statusesByTracker.get(event.trackerId) ?? new Set()
    statuses.add(event.status)
    statusesByTracker.set(event.trackerId, statuses)
    const counts = requestsByTrackerByClass.get(event.trackerId) ?? { reached: 0, shimmed: 0, denied: 0 }
    counts[statusOutcomeClass(event.status)] += event.count ?? 1
    requestsByTrackerByClass.set(event.trackerId, counts)
  }

  const rollup: ValuationOutcomeRollup = {
    reached: emptyOutcomeBucket(),
    shimmed: emptyOutcomeBucket(),
    denied: emptyOutcomeBucket(),
    disclaimer: VALUATION_DISCLAIMER
  }

  for (const [trackerId, statuses] of statusesByTracker) {
    const value = getTrackerValuation(trackerId)
    if (!value) continue
    const outcome: TrackerOutcome =
      statuses.has("active") || statuses.has("cannot_block") ? "reached" : statuses.has("mitigated") ? "shimmed" : "denied"
    const bucket = rollup[outcome]
    bucket.trackerIds.push(trackerId)
    bucket.thisVisitUsd += value.perVisit.microdollars / 1_000_000
    bucket.annualLowUsd += value.annual.low_usd
    bucket.annualHighUsd += value.annual.high_usd
    if (value.valueType === "revenue") {
      bucket.thisVisitRevenueUsd += value.perVisit.microdollars / 1_000_000
      bucket.annualRevenueLowUsd += value.annual.low_usd
      bucket.annualRevenueHighUsd += value.annual.high_usd
    } else {
      bucket.costTrackerCount += 1
    }
    bucket.requestCount += requestsByTrackerByClass.get(trackerId)?.[outcome] ?? 0
  }

  for (const bucket of [rollup.reached, rollup.shimmed, rollup.denied]) bucket.trackerIds.sort()
  return rollup
}

// Site↔tracker edges scoped to ONE tab, for the per-page Network graph. The
// cross-site rolling ledger (rollupValuationLedger) already produces edges
// for the all-time Value view; this is the honestly-scoped counterpart so
// the per-tab report can show "who connected on THIS page" instead of
// silently reusing the all-time graph under a page-scoped label. Only named
// trackers can appear — an edge needs a servesCategory to color it, and only
// the tracker DB provides that.
export function buildTabValuationEdges(events: ObserverEvent[], origin: string): ValuationEdge[] {
  const observationsByTracker = new Map<string, number>()
  for (const event of events) {
    if (!event.trackerId || event.firstParty) continue
    observationsByTracker.set(event.trackerId, (observationsByTracker.get(event.trackerId) ?? 0) + (event.count ?? 1))
  }

  const edges: ValuationEdge[] = []
  for (const [trackerId, observations] of observationsByTracker) {
    const serves = getTrackerServes(trackerId)
    if (!serves) continue
    const value = getTrackerValuation(trackerId)
    edges.push({
      siteOrigin: origin,
      trackerId,
      observations,
      thisPeriodVisitUsd: value ? value.perVisit.microdollars / 1_000_000 : 0,
      servesCategory: serves.category
    })
  }
  return edges
}

// The unnamed counterpart to buildTabValuationEdges: third parties observed
// on this page with no tracker-DB match, so the graph can show them too
// instead of silently dropping them — an ad-heavy page can have most of its
// third-party contact be unmatched (comScore, header-bidding partners, etc.),
// and a graph that only plots named trackers tells a much smaller story than
// the "Watching" headline count, which already counts these (observer-counts.ts).
// Folded by registrable domain so subdomains of the same host collapse to one
// node, matching the headline count's folding.
export function buildUnclassifiedGraphEdges(events: ObserverEvent[], origin: string): UnclassifiedGraphEdge[] {
  const observationsByDomain = new Map<string, number>()
  for (const event of events) {
    if (event.firstParty || event.status !== "active" || !isUnclassifiedObservation(event)) continue
    const host = hostForEvent(event)
    if (!host) continue
    const domain = registrableDomain(host)
    if (!domain) continue
    observationsByDomain.set(domain, (observationsByDomain.get(domain) ?? 0) + (event.count ?? 1))
  }

  return [...observationsByDomain.entries()].map(([host, observations]) => ({ siteOrigin: origin, host, observations }))
}

export function formatUsd(value: number): string {
  // Valuation data is validated nonnegative, but a display formatter must
  // not render "$NaN"/"$Infinity"/"$-3" if garbage arrives anyway.
  if (!Number.isFinite(value) || value <= 0) return "$0"
  // Positive-but-immeasurable must not print as a string of zeros — "$0.00000000"
  // claims exact zero for a value that isn't.
  if (value < 1e-8) return "<$0.00000001"
  // 0.995 rounds into whole-dollar territory either way; branching on >= 1
  // produced "$1.00–$1" ranges (low printing larger-looking than its high).
  if (value >= 0.995) return `$${Math.round(value).toLocaleString("en-US")}`
  if (value >= 0.01) return `$${value.toFixed(2)}`
  // Sub-cent amounts: two significant digits, never exponential notation.
  // "$0.0013" reads as a number; "$0.001305" reads as noise.
  const digits = Math.min(8, Math.ceil(-Math.log10(value)) + 1)
  const formatted = value.toFixed(digits)
  // toFixed can round across its own branch boundary (0.00995 -> "0.0100");
  // re-route those to the cents format instead of printing four decimals.
  if (Number.parseFloat(formatted) >= 0.01) return `$${Number.parseFloat(formatted).toFixed(2)}`
  return `$${formatted}`
}

export function formatUsdRange(low: number, high: number): string {
  // Collapse on the RENDERED strings, not the raw numbers: 4.6 and 5.4 both
  // print "$5", and "$5–$5" is a nonsense range.
  const lowFormatted = formatUsd(low)
  const highFormatted = formatUsd(high)
  return lowFormatted === highFormatted ? lowFormatted : `${lowFormatted}–${highFormatted}`
}
