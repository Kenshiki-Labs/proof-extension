import { describe, expect, it } from "vitest"

import type { ObserverEvent } from "~core/domain/types"
import {
  createEmptyValuationLedger,
  dayKey,
  normalizeValuationLedger,
  periodStart,
  pruneValuationLedger,
  recordSiteVisit,
  rollupValuationLedger,
  upsertValuationLedgerEvent
} from "./valuation-ledger"

const NOW = Date.UTC(2026, 6, 3, 12, 0, 0)
const DAY = 24 * 60 * 60 * 1000

function event(overrides: Partial<ObserverEvent> = {}): ObserverEvent {
  return {
    id: "event-1",
    tabId: 1,
    origin: "https://example.test",
    observedAt: NOW,
    source: "network",
    trackerId: "meta-pixel",
    companyId: "meta",
    firstParty: false,
    eventType: "request_seen",
    blockability: "network_blockable",
    status: "active",
    confidence: "confirmed",
    evidence: ["Request matched tracker domain."],
    ...overrides
  }
}

describe("valuation ledger basics", () => {
  it("normalizes malformed input to an empty ledger", () => {
    expect(normalizeValuationLedger(undefined)).toEqual(createEmptyValuationLedger())
    expect(normalizeValuationLedger({ schemaVersion: 1, siteVisits: [], trackerPresence: [] })).toEqual(createEmptyValuationLedger())
  })

  it("records site visits by day and origin", () => {
    let ledger = createEmptyValuationLedger()
    ledger = recordSiteVisit(ledger, "visit-1", "https://example.test", NOW)
    ledger = recordSiteVisit(ledger, "visit-1", "https://example.test", NOW + 1000)
    ledger = recordSiteVisit(ledger, "visit-2", "https://example.test", NOW + 2000)
    ledger = recordSiteVisit(ledger, "visit-3", "https://other.test", NOW)

    expect(ledger.siteVisits).toHaveLength(3)
    expect(ledger.siteVisits.find((entry) => entry.visitId === "visit-1")?.visits).toBe(2)
  })

  it("dedupes tracker presence by visit and tracker while preserving raw observation count", () => {
    let ledger = createEmptyValuationLedger()
    ledger = upsertValuationLedgerEvent(ledger, event({ count: 40 }), "visit-1")
    ledger = upsertValuationLedgerEvent(ledger, event({ id: "event-2", count: 2, observedAt: NOW + 10 }), "visit-1")

    expect(ledger.trackerPresence).toHaveLength(1)
    expect(ledger.trackerPresence[0]).toMatchObject({ visitId: "visit-1", trackerId: "meta-pixel", observations: 42, pageVisitsWithTracker: 1 })
    expect(ledger.trackerPresence[0]?.valuation).toMatchObject({ perVisitMicrodollars: 420, annualLowUsd: 185, annualHighUsd: 250 })
  })

  it("ignores diagnostics, exposure scans, and unknown trackers", () => {
    let ledger = createEmptyValuationLedger()
    ledger = upsertValuationLedgerEvent(ledger, event({ eventType: "extension_diagnostic", trackerId: "meta-pixel" }), "visit-1")
    ledger = upsertValuationLedgerEvent(ledger, event({ source: "extension-scan", eventType: "browser_surface", trackerId: "meta-pixel" }), "visit-1")
    ledger = upsertValuationLedgerEvent(ledger, event({ trackerId: "unknown-tracker" }), "visit-1")
    expect(ledger.trackerPresence).toEqual([])
  })
})

describe("rollupValuationLedger", () => {
  it("sums visit-level presence but dedupes annual values by tracker", () => {
    let ledger = createEmptyValuationLedger()
    ledger = recordSiteVisit(ledger, "visit-1", "https://one.test", NOW)
    ledger = recordSiteVisit(ledger, "visit-2", "https://two.test", NOW)
    ledger = recordSiteVisit(ledger, "visit-3", "https://one.test", NOW + 1000)
    ledger = upsertValuationLedgerEvent(ledger, event({ origin: "https://one.test", count: 40 }), "visit-1")
    ledger = upsertValuationLedgerEvent(ledger, event({ origin: "https://two.test", count: 1 }), "visit-2")
    ledger = upsertValuationLedgerEvent(ledger, event({ origin: "https://one.test", trackerId: "fullstory", companyId: "fullstory" }), "visit-3")

    const rollup = rollupValuationLedger(ledger, "day", NOW)

    expect(rollup.siteCount).toBe(2)
    expect(rollup.visitCount).toBe(3)
    expect(rollup.trackerCount).toBe(2)
    expect(rollup.observations).toBe(42)
    expect(rollup.thisPeriodVisitUsd).toBeCloseTo((420 + 420 + 40) / 1_000_000, 12)
    expect(rollup.annualRevenueLowUsd).toBe(185)
    expect(rollup.annualRevenueHighUsd).toBe(250)
    expect(rollup.annualOperatorCostLowUsd).toBe(0.5)
    expect(rollup.flowRollups.find((entry) => entry.flow === "platform_ads")).toMatchObject({ trackerCount: 1, observations: 41, annualLowUsd: 185, annualHighUsd: 250 })
    expect(rollup.flowRollups.find((entry) => entry.flow === "operator_saas")).toMatchObject({ trackerCount: 1, observations: 1, annualLowUsd: 0.5, annualHighUsd: 5 })
    expect(rollup.flowRollups.find((entry) => entry.flow === "programmatic")).toMatchObject({ trackerCount: 0, observations: 0, annualLowUsd: 0, annualHighUsd: 0 })
    expect(rollup.topTrackers[0]).toMatchObject({ id: "meta-pixel", siteCount: 2, visitCount: 2, observations: 41 })
    expect(rollup.topSites[0]).toMatchObject({ id: "https://one.test", trackerCount: 2, visitCount: 2 })
  })

  it("filters day, week, month, and all periods", () => {
    let ledger = createEmptyValuationLedger()
    ledger = recordSiteVisit(ledger, "visit-today", "https://today.test", NOW)
    ledger = recordSiteVisit(ledger, "visit-old", "https://old.test", NOW - 10 * DAY)
    ledger = upsertValuationLedgerEvent(ledger, event({ origin: "https://today.test", observedAt: NOW }), "visit-today")
    ledger = upsertValuationLedgerEvent(ledger, event({ origin: "https://old.test", observedAt: NOW - 10 * DAY }), "visit-old")

    expect(rollupValuationLedger(ledger, "day", NOW).siteCount).toBe(1)
    expect(rollupValuationLedger(ledger, "week", NOW).siteCount).toBe(1)
    expect(rollupValuationLedger(ledger, "month", NOW).siteCount).toBe(2)
    expect(rollupValuationLedger(ledger, "all", NOW).siteCount).toBe(2)
    expect(dayKey(NOW)).toBe("2026-07-03")
    expect(periodStart("week", NOW)).toBe(NOW - 7 * DAY)
  })

  it("prunes old site visits and tracker presence", () => {
    let ledger = createEmptyValuationLedger()
    ledger = recordSiteVisit(ledger, "visit-today", "https://today.test", NOW)
    ledger = recordSiteVisit(ledger, "visit-old", "https://old.test", NOW - 20 * DAY)
    ledger = upsertValuationLedgerEvent(ledger, event({ origin: "https://today.test", observedAt: NOW }), "visit-today")
    ledger = upsertValuationLedgerEvent(ledger, event({ origin: "https://old.test", observedAt: NOW - 20 * DAY }), "visit-old")

    const pruned = pruneValuationLedger(ledger, 14, NOW)
    expect(pruned.siteVisits.map((entry) => entry.siteOrigin)).toEqual(["https://today.test"])
    expect(pruned.trackerPresence.map((entry) => entry.siteOrigin)).toEqual(["https://today.test"])
  })
})