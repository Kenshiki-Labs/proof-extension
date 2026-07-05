import { compactEvents, type DisplayObservation } from "~core/report/display"
import { getObserverRemediation } from "~core/domain/remediation"
import { getTrackerServes, getTrackerValuation, rollupObservedValuations } from "~core/domain/valuation"
import { blockingGuidance } from "~core/domain/blocking-policy"
import { countWatchingObservers } from "~core/domain/observer-counts"
import { isPersistenceSurfaceEvent, isUnclassifiedObservation } from "~core/state/summaries"
import type { ObserverEvent, SiteSummary } from "~core/domain/types"

// The importance model. Every surface that lists observers sorts by this
// score; users never have to work out what matters — the product ranks.
// Weights are part of the data contract (docs/data-contract.md): change
// them here, update the doc, and the pinned tests.
//
// Tiers compress the ranking into three glanceable colors:
//   red   — companies that give you nothing back (only their business)
//   amber — the ads trade (relevance claimed, profiling certain)
//   gray  — site tooling, features you use, and unattributed observations

export type AttentionTier = "red" | "amber" | "gray"

export type RankedObserver = {
  observation: DisplayObservation
  score: number
  tier: AttentionTier
}

const SERVES_WEIGHT: Record<string, number> = {
  only_their_business: 40,
  advertisers_and_maybe_you: 25,
  the_site: 10,
  you_and_the_site: 5
}

const CONFIDENCE_WEIGHT: Record<ObserverEvent["confidence"], number> = {
  confirmed: 10,
  probable: 6,
  weak: 2
}

export function attentionTier(event: ObserverEvent): AttentionTier {
  const serves = getTrackerServes(event.trackerId)
  if (serves?.category === "only_their_business") return "red"
  if (serves?.category === "advertisers_and_maybe_you") return "amber"
  return "gray"
}

export function attentionScore(event: ObserverEvent): number {
  const serves = getTrackerServes(event.trackerId)
  let score = SERVES_WEIGHT[serves?.category ?? ""] ?? 8 // unattributed: above tooling, below ads
  score += CONFIDENCE_WEIGHT[event.confidence]

  const valuation = getTrackerValuation(event.trackerId)
  if (valuation && valuation.annual.high_usd > 0) {
    // log-scaled: $1 → ~3, $100 → ~10, $500 → ~13. Money matters, but never
    // outranks the who-it-serves classification.
    score += Math.min(15, Math.log10(valuation.annual.high_usd + 1) * 5)
  }

  const remediation = getObserverRemediation(event)
  if (remediation?.explanation.riskLevel === "high") score += 12
  if (remediation?.explanation.riskLevel === "medium") score += 6

  // Already blocked drops sharply — handled, not urgent.
  if (event.status === "blocked") score *= 0.3
  if (event.status === "mitigated") score *= 0.5

  return Math.round(score * 10) / 10
}

const TIER_ORDER: Record<AttentionTier, number> = { red: 0, amber: 1, gray: 2 }

export function rankObservers(events: ObserverEvent[]): RankedObserver[] {
  return compactEvents(events)
    .filter((observation) => observation.event.source !== "extension-scan")
    .filter((observation) => !isUnclassifiedObservation(observation.event))
    .filter((observation) => !isPersistenceSurfaceEvent(observation.event))
    .map((observation) => ({
      observation,
      score: attentionScore(observation.event),
      tier: attentionTier(observation.event)
    }))
    .sort(
      // Tier dominates: a no-trade broker always outranks an ads-trade
      // platform regardless of dollars — the classification IS the harm
      // story. Score orders within a tier; blocked items sink via score.
      (left, right) =>
        TIER_ORDER[left.tier] - TIER_ORDER[right.tier] ||
        right.score - left.score ||
        right.observation.count - left.observation.count ||
        left.observation.event.id.localeCompare(right.observation.event.id)
    )
}

export type Verdict = {
  companiesWatching: number
  tierCounts: Record<AttentionTier, number>
  noTradeCount: number
  noTradeAnnualLowUsd: number
  noTradeAnnualHighUsd: number
  // Observers with a one-click, low-friction opt-out (no ID check).
  quickActionCount: number
  topObservers: RankedObserver[]
}

export function buildVerdict(summary: SiteSummary, topN = 3): Verdict {
  const ranked = rankObservers(summary.events)
  const activeRanked = ranked.filter((item) => item.observation.event.status === "active")
  const tierCounts: Record<AttentionTier, number> = { red: 0, amber: 0, gray: 0 }
  const countedTrackers = new Set<string>()
  let quickActionCount = 0

  for (const item of activeRanked) {
    const trackerId = item.observation.event.trackerId
    const key = trackerId ?? item.observation.event.id
    if (countedTrackers.has(key)) continue
    countedTrackers.add(key)
    tierCounts[item.tier] += 1

    const remediation = getObserverRemediation(item.observation.event)
    const guidance = blockingGuidance(trackerId)
    if (remediation && !remediation.identityVerificationRequired && (remediation.frictionClass === "low" || guidance.offerBlocking)) {
      quickActionCount += 1
    }
  }

  const activeObserverEvents = activeRanked.map((item) => item.observation.event)
  const rollup = rollupObservedValuations(activeObserverEvents)
  return {
    companiesWatching: countWatchingObservers(summary.events),
    tierCounts,
    noTradeCount: rollup.servesCounts.only_their_business,
    noTradeAnnualLowUsd: rollup.onlyTheirBusinessAnnualLowUsd,
    noTradeAnnualHighUsd: rollup.onlyTheirBusinessAnnualHighUsd,
    quickActionCount,
    topObservers: activeRanked.slice(0, topN)
  }
}
