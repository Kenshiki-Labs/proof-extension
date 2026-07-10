import { MonetizationFlowSchema, RollingValuationSummarySchema, ValuationLedgerSchema } from "~core/contracts/schemas"
import { getTrackerServes, getTrackerValuation, VALUATION_DISCLAIMER } from "~core/domain/valuation"
import { isPageActivityEvent } from "~core/state/summaries"
import type { ObserverEvent, RollingValuationItem, RollingValuationSummary, TrackerPresenceLedgerEntry, ValuationLedger, ValuationPeriod, ValuationSnapshot } from "~core/domain/types"

const MS_PER_DAY = 24 * 60 * 60 * 1000
// Derived from the schema so the flow list cannot drift from the contract.
const MONETIZATION_FLOWS = MonetizationFlowSchema.options

export function createEmptyValuationLedger(): ValuationLedger {
  return { schemaVersion: 1, siteVisits: [], trackerPresence: [] }
}

export function normalizeValuationLedger(raw: unknown): ValuationLedger {
  const parsed = ValuationLedgerSchema.safeParse(raw)
  return parsed.success ? parsed.data : createEmptyValuationLedger()
}

// UTC calendar date. The stored `day` field is currently write-only — every
// period computation filters on the raw timestamps instead — so its first
// consumer must not assume it reflects the user's local date.
export function dayKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10)
}

export function periodStart(period: ValuationPeriod, now = Date.now()): number {
  if (period === "all") return 0
  if (period === "day") return now - MS_PER_DAY
  if (period === "week") return now - 7 * MS_PER_DAY
  return now - 30 * MS_PER_DAY
}

function siteVisitKey(visitId: string) {
  return visitId
}

function trackerPresenceKey(visitId: string, trackerId: string) {
  return `${visitId}|${trackerId}`
}

// One entry per visitId, always with visits: 1. Visit dedupe happens at the
// caller (background.ts ensureSiteVisitForTab mints a fresh UUID per
// tab+origin visit and reuses it via activeVisitByTabId), so a repeated
// visitId can only be a replayed call for the same visit — kept idempotent
// here rather than counted as a phantom extra visit.
export function recordSiteVisit(ledger: ValuationLedger, visitId: string, siteOrigin: string, observedAt: number): ValuationLedger {
  const key = siteVisitKey(visitId)
  if (ledger.siteVisits.some((entry) => siteVisitKey(entry.visitId) === key)) return ledger

  const entry = { day: dayKey(observedAt), visitId, siteOrigin, firstVisitedAt: observedAt, lastVisitedAt: observedAt, visits: 1 }
  const siteVisits = [...ledger.siteVisits, entry]
  return { ...ledger, siteVisits: siteVisits.sort((left, right) => siteVisitKey(left.visitId).localeCompare(siteVisitKey(right.visitId))) }
}

function valuationSnapshot(event: ObserverEvent): ValuationSnapshot | null {
  const value = getTrackerValuation(event.trackerId)
  if (!value) return null
  return {
    sourceFindingIds: value.sourceFindingIds,
    valueType: value.valueType,
    monetizationFlow: value.monetizationFlow,
    perVisitMicrodollars: value.perVisit.microdollars,
    annualLowUsd: value.annual.low_usd,
    annualHighUsd: value.annual.high_usd,
    confidence: value.confidence
  }
}

export function upsertValuationLedgerEvent(ledger: ValuationLedger, event: ObserverEvent, visitId: string): ValuationLedger {
  if (!isPageActivityEvent(event) || !event.trackerId) return ledger

  const valuation = valuationSnapshot(event)
  if (!valuation) return ledger

  const day = dayKey(event.observedAt)
  const key = trackerPresenceKey(visitId, event.trackerId)
  const occurrences = event.count ?? 1
  const existing = ledger.trackerPresence.find((entry) => trackerPresenceKey(entry.visitId, entry.trackerId) === key)
  const trackerPresence = existing
    ? ledger.trackerPresence.map((entry) =>
        trackerPresenceKey(entry.visitId, entry.trackerId) === key
          ? {
              ...entry,
              companyId: event.companyId ?? entry.companyId,
              firstObservedAt: Math.min(entry.firstObservedAt, event.observedAt),
              lastObservedAt: Math.max(entry.lastObservedAt, event.observedAt),
              observations: entry.observations + occurrences
            }
          : entry
      )
    : [
        ...ledger.trackerPresence,
        {
          day,
          visitId,
          siteOrigin: event.origin,
          trackerId: event.trackerId,
          ...(event.companyId ? { companyId: event.companyId } : {}),
          firstObservedAt: event.observedAt,
          lastObservedAt: event.observedAt,
          observations: occurrences,
          pageVisitsWithTracker: 1,
          valuation
        }
      ]

  return {
    ...ledger,
    trackerPresence: trackerPresence.sort((left, right) =>
      trackerPresenceKey(left.visitId, left.trackerId).localeCompare(trackerPresenceKey(right.visitId, right.trackerId))
    )
  }
}

export function pruneValuationLedger(ledger: ValuationLedger, retentionDays: number, now = Date.now()): ValuationLedger {
  const cutoff = now - retentionDays * MS_PER_DAY
  return {
    ...ledger,
    siteVisits: ledger.siteVisits.filter((entry) => entry.lastVisitedAt >= cutoff),
    trackerPresence: ledger.trackerPresence.filter((entry) => entry.lastObservedAt >= cutoff)
  }
}

function periodEntries(ledger: ValuationLedger, period: ValuationPeriod, now: number) {
  const cutoff = periodStart(period, now)
  return {
    siteVisits: ledger.siteVisits.filter((entry) => entry.lastVisitedAt >= cutoff),
    trackerPresence: ledger.trackerPresence.filter((entry) => entry.lastObservedAt >= cutoff)
  }
}

function latestByTracker(entries: TrackerPresenceLedgerEntry[]) {
  const latest = new Map<string, TrackerPresenceLedgerEntry>()
  for (const entry of entries) {
    const existing = latest.get(entry.trackerId)
    if (!existing || entry.lastObservedAt >= existing.lastObservedAt) latest.set(entry.trackerId, entry)
  }
  return [...latest.values()]
}

function visitUsd(entry: TrackerPresenceLedgerEntry) {
  return (entry.valuation.perVisitMicrodollars * entry.pageVisitsWithTracker) / 1_000_000
}

function topTrackers(entries: TrackerPresenceLedgerEntry[]): RollingValuationItem[] {
  const grouped = new Map<string, { sites: Set<string>; visits: Set<string>; observations: number; thisPeriodVisitUsd: number; latest: TrackerPresenceLedgerEntry }>()
  for (const entry of entries) {
    const existing = grouped.get(entry.trackerId) ?? { sites: new Set<string>(), visits: new Set<string>(), observations: 0, thisPeriodVisitUsd: 0, latest: entry }
    existing.sites.add(entry.siteOrigin)
    existing.visits.add(entry.visitId)
    existing.observations += entry.observations
    existing.thisPeriodVisitUsd += visitUsd(entry)
    if (entry.lastObservedAt >= existing.latest.lastObservedAt) existing.latest = entry
    grouped.set(entry.trackerId, existing)
  }
  return [...grouped.entries()]
    .map(([id, value]) => ({
      id,
      siteCount: value.sites.size,
      visitCount: value.visits.size,
      observations: value.observations,
      thisPeriodVisitUsd: value.thisPeriodVisitUsd,
      annualLowUsd: value.latest.valuation.annualLowUsd,
      annualHighUsd: value.latest.valuation.annualHighUsd
    }))
    .sort((left, right) => (right.siteCount ?? 0) - (left.siteCount ?? 0) || (right.visitCount ?? 0) - (left.visitCount ?? 0) || right.observations - left.observations || left.id.localeCompare(right.id))
}

function topSites(entries: TrackerPresenceLedgerEntry[]): RollingValuationItem[] {
  const grouped = new Map<string, { trackers: Set<string>; visits: Set<string>; observations: number; thisPeriodVisitUsd: number }>()
  for (const entry of entries) {
    const existing = grouped.get(entry.siteOrigin) ?? { trackers: new Set<string>(), visits: new Set<string>(), observations: 0, thisPeriodVisitUsd: 0 }
    existing.trackers.add(entry.trackerId)
    existing.visits.add(entry.visitId)
    existing.observations += entry.observations
    existing.thisPeriodVisitUsd += visitUsd(entry)
    grouped.set(entry.siteOrigin, existing)
  }
  return [...grouped.entries()]
    .map(([id, value]) => ({ id, visitCount: value.visits.size, trackerCount: value.trackers.size, observations: value.observations, thisPeriodVisitUsd: value.thisPeriodVisitUsd }))
    .sort((left, right) => (right.trackerCount ?? 0) - (left.trackerCount ?? 0) || (right.visitCount ?? 0) - (left.visitCount ?? 0) || right.observations - left.observations || left.id.localeCompare(right.id))
}

// Site↔tracker edges for the network graph: one edge per pair in the
// period, weighted by observations, colored by who the tracker serves.
// Capped to keep message payloads and the SVG readable.
const MAX_EDGES = 80

function buildEdges(entries: TrackerPresenceLedgerEntry[]) {
  const grouped = new Map<string, { siteOrigin: string; trackerId: string; observations: number; thisPeriodVisitUsd: number }>()
  for (const entry of entries) {
    const key = `${entry.siteOrigin}|${entry.trackerId}`
    const existing = grouped.get(key) ?? { siteOrigin: entry.siteOrigin, trackerId: entry.trackerId, observations: 0, thisPeriodVisitUsd: 0 }
    existing.observations += entry.observations
    existing.thisPeriodVisitUsd += visitUsd(entry)
    grouped.set(key, existing)
  }
  return [...grouped.values()]
    .map((edge) => ({ ...edge, servesCategory: getTrackerServes(edge.trackerId)?.category ?? ("only_their_business" as const) }))
    .sort((left, right) => right.observations - left.observations || left.siteOrigin.localeCompare(right.siteOrigin) || left.trackerId.localeCompare(right.trackerId))
    .slice(0, MAX_EDGES)
}

function servesRollup(deduped: TrackerPresenceLedgerEntry[]) {
  const servesCounts = { you_and_the_site: 0, the_site: 0, advertisers_and_maybe_you: 0, only_their_business: 0 }
  let onlyTheirBusinessAnnualLowUsd = 0
  let onlyTheirBusinessAnnualHighUsd = 0
  for (const entry of deduped) {
    const serves = getTrackerServes(entry.trackerId)
    if (!serves) continue
    servesCounts[serves.category] += 1
    if (serves.category === "only_their_business") {
      onlyTheirBusinessAnnualLowUsd += entry.valuation.annualLowUsd
      onlyTheirBusinessAnnualHighUsd += entry.valuation.annualHighUsd
    }
  }
  return { servesCounts, onlyTheirBusinessAnnualLowUsd, onlyTheirBusinessAnnualHighUsd }
}

function flowRollups(entries: TrackerPresenceLedgerEntry[], deduped: TrackerPresenceLedgerEntry[]) {
  const byFlow = new Map(
    MONETIZATION_FLOWS.map((flow) => [
      flow,
      { annualHighUsd: 0, annualLowUsd: 0, flow, observations: 0, thisPeriodVisitUsd: 0, trackerCount: 0 }
    ])
  )

  for (const entry of deduped) {
    const rollup = byFlow.get(entry.valuation.monetizationFlow)
    if (!rollup) continue
    rollup.trackerCount += 1
    rollup.annualLowUsd += entry.valuation.annualLowUsd
    rollup.annualHighUsd += entry.valuation.annualHighUsd
  }

  for (const entry of entries) {
    const rollup = byFlow.get(entry.valuation.monetizationFlow)
    if (!rollup) continue
    rollup.observations += entry.observations
    rollup.thisPeriodVisitUsd += visitUsd(entry)
  }

  return MONETIZATION_FLOWS.map((flow) => byFlow.get(flow)!)
}

export function rollupValuationLedger(ledger: ValuationLedger, period: ValuationPeriod, now = Date.now()): RollingValuationSummary {
  const entries = periodEntries(ledger, period, now)
  const deduped = latestByTracker(entries.trackerPresence)
  const revenue = deduped.filter((entry) => entry.valuation.valueType === "revenue")
  const cost = deduped.filter((entry) => entry.valuation.valueType === "cost")
  const sumAnnual = (items: TrackerPresenceLedgerEntry[], field: "annualLowUsd" | "annualHighUsd") =>
    items.reduce((total, entry) => total + entry.valuation[field], 0)

  const summary = {
    period,
    siteCount: new Set(entries.siteVisits.map((entry) => entry.siteOrigin)).size,
    visitCount: new Set(entries.siteVisits.map((entry) => entry.visitId)).size,
    trackerCount: new Set(entries.trackerPresence.map((entry) => entry.trackerId)).size,
    observations: entries.trackerPresence.reduce((total, entry) => total + entry.observations, 0),
    thisPeriodVisitUsd: entries.trackerPresence.reduce((total, entry) => total + visitUsd(entry), 0),
    annualRevenueLowUsd: sumAnnual(revenue, "annualLowUsd"),
    annualRevenueHighUsd: sumAnnual(revenue, "annualHighUsd"),
    revenueTrackerCount: revenue.length,
    annualOperatorCostLowUsd: sumAnnual(cost, "annualLowUsd"),
    annualOperatorCostHighUsd: sumAnnual(cost, "annualHighUsd"),
    costTrackerCount: cost.length,
    flowRollups: flowRollups(entries.trackerPresence, deduped),
    topTrackers: topTrackers(entries.trackerPresence).slice(0, 10),
    topSites: topSites(entries.trackerPresence).slice(0, 10),
    edges: buildEdges(entries.trackerPresence),
    ...servesRollup(deduped),
    disclaimer: VALUATION_DISCLAIMER
  }

  return RollingValuationSummarySchema.parse(summary)
}