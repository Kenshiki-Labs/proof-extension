import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { validateTrackerDatabase } from "~core/db/validate"
import type { ObserverEvent } from "~core/domain/types"
import { formatUsd, formatUsdRange, getTrackerValuation, rollupObservedValuations, VALUATION_DISCLAIMER } from "./valuation"

const root = resolve(__dirname, "../../..")
const normalizedValuations = JSON.parse(readFileSync(resolve(root, "intelligence/normalized/valuations.json"), "utf8"))

function event(trackerId: string | undefined, id: string): ObserverEvent {
  return {
    id,
    tabId: 1,
    origin: "https://example.test",
    observedAt: 100,
    source: "network",
    ...(trackerId ? { trackerId } : {}),
    firstParty: false,
    eventType: "request_seen",
    blockability: "network_blockable",
    status: "active",
    confidence: "confirmed",
    evidence: ["Request matched tracker domain."]
  }
}

describe("perPersonValue database", () => {
  const { trackers } = validateTrackerDatabase()

  it("covers every tracker with consistent ranges and midpoints", () => {
    for (const tracker of trackers) {
      const value = tracker.perPersonValue
      expect(value.annual.high_usd, tracker.id).toBeGreaterThanOrEqual(value.annual.low_usd)
      expect(value.annual.midpoint_usd, tracker.id).toBeCloseTo((value.annual.low_usd + value.annual.high_usd) / 2, 4)
      expect(value.perVisit.dollars, tracker.id).toBeCloseTo(value.perVisit.microdollars / 1_000_000, 12)
    }
  })

  it("matches the normalized valuation projection totals across all trackers", () => {
    const totalLow = trackers.reduce((sum, tracker) => sum + tracker.perPersonValue.annual.low_usd, 0)
    const totalHigh = trackers.reduce((sum, tracker) => sum + tracker.perPersonValue.annual.high_usd, 0)
    const totalMicro = trackers.reduce((sum, tracker) => sum + tracker.perPersonValue.perVisit.microdollars, 0)
    const normalizedLow = normalizedValuations.records.reduce((sum: number, record: { perPersonValue: { annual: { low_usd: number } } }) => sum + record.perPersonValue.annual.low_usd, 0)
    const normalizedHigh = normalizedValuations.records.reduce((sum: number, record: { perPersonValue: { annual: { high_usd: number } } }) => sum + record.perPersonValue.annual.high_usd, 0)
    const normalizedMicro = normalizedValuations.records.reduce((sum: number, record: { perPersonValue: { perVisit: { microdollars: number } } }) => sum + record.perPersonValue.perVisit.microdollars, 0)
    expect(totalLow).toBeCloseTo(normalizedLow, 8)
    expect(totalHigh).toBeCloseTo(normalizedHigh, 8)
    expect(totalMicro).toBeCloseTo(normalizedMicro, 8)
  })

  it("pins flagship numbers and value types from the spec", () => {
    expect(getTrackerValuation("google-ads")).toMatchObject({
      valueType: "revenue",
      monetizationFlow: "platform_ads",
      annual: { low_usd: 420, high_usd: 500 },
      perVisit: { microdollars: 768 }
    })
    expect(getTrackerValuation("meta-pixel")).toMatchObject({ annual: { low_usd: 185, high_usd: 250 } })
    expect(getTrackerValuation("fullstory")).toMatchObject({ valueType: "cost", monetizationFlow: "operator_saas" })
    expect(getTrackerValuation("google-analytics")).toMatchObject({ valueType: "cost", annual: { high_usd: 0 } })
    expect(getTrackerValuation("nonexistent")).toBeNull()
    expect(getTrackerValuation(undefined)).toBeNull()
  })
})

describe("rollupObservedValuations", () => {
  it("separates revenue from operator cost and sums per-visit microdollars", () => {
    const rollup = rollupObservedValuations([
      event("meta-pixel", "e1"),
      event("google-ads", "e2"),
      event("fullstory", "e3"),
      event(undefined, "e4")
    ])

    expect(rollup.revenueTrackerCount).toBe(2)
    expect(rollup.costTrackerCount).toBe(1)
    expect(rollup.annualRevenueLowUsd).toBe(185 + 420)
    expect(rollup.annualRevenueHighUsd).toBe(250 + 500)
    expect(rollup.annualRevenueMidpointUsd).toBeCloseTo((605 + 750) / 2, 6)
    expect(rollup.annualOperatorCostLowUsd).toBe(0.5)
    expect(rollup.thisVisitUsd).toBeCloseTo((420 + 768 + 40) / 1_000_000, 12)
    expect(rollup.perTracker[0]?.trackerId).toBe("google-ads")
    expect(rollup.disclaimer).toBe(VALUATION_DISCLAIMER)
  })

  it("deduplicates repeated observations of the same tracker", () => {
    const rollup = rollupObservedValuations([event("meta-pixel", "e1"), event("meta-pixel", "e2")])
    expect(rollup.revenueTrackerCount).toBe(1)
    expect(rollup.annualRevenueLowUsd).toBe(185)
  })

  it("returns an honest zero rollup when nothing is attributed", () => {
    const rollup = rollupObservedValuations([event(undefined, "e1")])
    expect(rollup.perTracker).toEqual([])
    expect(rollup.thisVisitUsd).toBe(0)
    expect(rollup.annualRevenueLowUsd).toBe(0)
  })
})

describe("usd formatting", () => {
  it("formats dollars, cents, micro-amounts, ranges, and zero", () => {
    expect(formatUsd(460)).toBe("$460")
    expect(formatUsd(0.05)).toBe("$0.05")
    expect(formatUsd(0.000768)).toBe("$0.000768")
    expect(formatUsd(0)).toBe("$0")
    expect(formatUsdRange(420, 500)).toBe("$420–$500")
    expect(formatUsdRange(0, 0)).toBe("$0")
    expect(formatUsdRange(1234, 5678)).toBe("$1,234–$5,678")
  })
})
