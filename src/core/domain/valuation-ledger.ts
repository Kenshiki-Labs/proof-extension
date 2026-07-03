import { RollingValuationSummarySchema, ValuationLedgerSchema } from "~core/contracts/schemas"
import { getTrackerValuation, VALUATION_DISCLAIMER } from "~core/domain/valuation"
import { isPageActivityEvent } from "~core/state/summaries"
import type { ObserverEvent, RollingValuationItem, RollingValuationSummary, TrackerPresenceLedgerEntry, ValuationLedger, ValuationPeriod, ValuationSnapshot } from "~core/domain/types"

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function createEmptyValuationLedger(): ValuationLedger {
  return { schemaVersion: 1, siteVisits: [], trackerPresence: [] }
}

export function normalizeValuationLedger(raw: unknown): ValuationLedger {
  const parsed = ValuationLedgerSchema.safeParse(raw)
  return parsed.success ? parsed.data : createEmptyValuationLedger()
}

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

export function recordSiteVisit(ledger: ValuationLedger, visitId: string, siteOrigin: string, observedAt: number): ValuationLedger {
  const day = dayKey(observedAt)
  const key = siteVisitKey(visitId)
  const existing = ledger.siteVisits.find((entry) => siteVisitKey(entry.visitId) === key)
  const siteVisits = existing
    ? ledger.siteVisits.map((entry) =>
        siteVisitKey(entry.visitId) === key
          ? { ...entry, firstVisitedAt: Math.min(entry.firstVisitedAt, observedAt), lastVisitedAt: Math.max(entry.lastVisitedAt, observedAt), visits: entry.visits + 1 }
          : entry
      )
    : [...ledger.siteVisits, { day, visitId, siteOrigin, firstVisitedAt: observedAt, lastVisitedAt: observedAt, visits: 1 }]

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
    topTrackers: topTrackers(entries.trackerPresence).slice(0, 10),
    topSites: topSites(entries.trackerPresence).slice(0, 10),
    disclaimer: VALUATION_DISCLAIMER
  }

  return RollingValuationSummarySchema.parse(summary)
}