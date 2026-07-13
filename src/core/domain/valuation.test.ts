import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { validateTrackerDatabase } from "~core/db/validate"
import type { ObserverEvent } from "~core/domain/types"

import {
  buildTabValuationEdges,
  buildUnclassifiedGraphEdges,
  formatUsd,
  formatUsdRange,
  getTrackerValuation,
  rollupObservedValuations,
  rollupValuationOutcomes,
  VALUATION_DISCLAIMER
} from "./valuation"

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
    const normalizedLow = normalizedValuations.records.reduce(
      (sum: number, record: { perPersonValue: { annual: { low_usd: number } } }) => sum + record.perPersonValue.annual.low_usd,
      0
    )
    const normalizedHigh = normalizedValuations.records.reduce(
      (sum: number, record: { perPersonValue: { annual: { high_usd: number } } }) => sum + record.perPersonValue.annual.high_usd,
      0
    )
    const normalizedMicro = normalizedValuations.records.reduce(
      (sum: number, record: { perPersonValue: { perVisit: { microdollars: number } } }) =>
        sum + record.perPersonValue.perVisit.microdollars,
      0
    )
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
    expect(formatUsd(0.000768)).toBe("$0.00077")
    expect(formatUsd(0.001305)).toBe("$0.0013")
    expect(formatUsd(0)).toBe("$0")
    expect(formatUsdRange(420, 500)).toBe("$420–$500")
    expect(formatUsdRange(0, 0)).toBe("$0")
    expect(formatUsdRange(1234, 5678)).toBe("$1,234–$5,678")
  })

  it("renders garbage input as $0 instead of $NaN or a negative amount", () => {
    expect(formatUsd(Number.NaN)).toBe("$0")
    expect(formatUsd(Number.POSITIVE_INFINITY)).toBe("$0")
    expect(formatUsd(Number.NEGATIVE_INFINITY)).toBe("$0")
    expect(formatUsd(-3)).toBe("$0")
    expect(formatUsd(-0.004)).toBe("$0")
  })
})

describe("buildTabValuationEdges — the per-page Network graph, not the cross-site ledger", () => {
  it("builds one edge per named tracker on this page, priced and colored", () => {
    const edges = buildTabValuationEdges(
      [event("google-ads", "e1"), event("google-ads", "e2"), event("fullstory", "e3")],
      "https://example.test"
    )

    expect(edges).toHaveLength(2)
    const googleAds = edges.find((edge) => edge.trackerId === "google-ads")
    expect(googleAds).toMatchObject({ siteOrigin: "https://example.test", observations: 2, servesCategory: "advertisers_and_maybe_you" })
    // A tracker's per-visit value is counted once per presence, not once per
    // raw request — 2 observations still means one $0.000768 presence.
    expect(googleAds?.thisPeriodVisitUsd).toBeCloseTo(0.000768, 6)
  })

  it("excludes unclassified hosts, first-party events, and trackers missing a whoItServes category", () => {
    const edges = buildTabValuationEdges(
      [
        event(undefined, "unclassified"),
        { ...event("google-ads", "first-party"), firstParty: true },
        event("nonexistent-tracker-id", "unknown-serves")
      ],
      "https://example.test"
    )
    expect(edges).toEqual([])
  })
})

describe("buildUnclassifiedGraphEdges — unnamed third parties, still in the picture", () => {
  function unclassifiedEvent(overrides: Partial<ObserverEvent>): ObserverEvent {
    return {
      id: "unclassified",
      tabId: 1,
      origin: "https://example.test",
      observedAt: 100,
      source: "network",
      firstParty: false,
      eventType: "request_seen",
      blockability: "observable_only",
      status: "active",
      confidence: "confirmed",
      evidenceTier: "observed",
      evidence: ["Third-party request observed; no tracker record matched it."],
      ...overrides
    }
  }

  it("folds subdomains of the same unmatched host into one edge", () => {
    const edges = buildUnclassifiedGraphEdges(
      [
        unclassifiedEvent({ id: "e1", details: { host: "sb.scorecardresearch.com" } }),
        unclassifiedEvent({ id: "e2", details: { host: "b.scorecardresearch.com" } }),
        unclassifiedEvent({ id: "e3", details: { host: "c.permutive.com" } })
      ],
      "https://example.test"
    )

    expect(edges).toEqual(
      expect.arrayContaining([
        { siteOrigin: "https://example.test", host: "scorecardresearch.com", observations: 2 },
        { siteOrigin: "https://example.test", host: "permutive.com", observations: 1 }
      ])
    )
    expect(edges).toHaveLength(2)
  })

  it("excludes first-party, named, and inactive events", () => {
    const edges = buildUnclassifiedGraphEdges(
      [
        { ...unclassifiedEvent({ id: "fp", details: { host: "cdn.example" } }), firstParty: true },
        unclassifiedEvent({ id: "named", trackerId: "google-ads", details: { host: "doubleclick.net" } }),
        { ...unclassifiedEvent({ id: "blocked", details: { host: "cdn.example" } }), status: "blocked" }
      ],
      "https://example.test"
    )
    expect(edges).toEqual([])
  })
})

describe("who-it-serves slice", () => {
  it("splits the rollup by beneficiary and prices the no-trade subset", () => {
    const rollup = rollupObservedValuations([
      event("liveramp", "e1"), // only_their_business, 0.5–5
      event("tapad", "e2"), // only_their_business, 0.5–3
      event("google-ads", "e3"), // advertisers_and_maybe_you
      event("fullstory", "e4"), // the_site
      event("intercom", "e5") // you_and_the_site
    ])

    expect(rollup.servesCounts).toEqual({
      you_and_the_site: 1,
      the_site: 1,
      advertisers_and_maybe_you: 1,
      only_their_business: 2
    })
    expect(rollup.onlyTheirBusinessAnnualLowUsd).toBe(1)
    expect(rollup.onlyTheirBusinessAnnualHighUsd).toBe(8)
  })
})

describe("rollupValuationOutcomes", () => {
  function statusEvent(trackerId: string, id: string, status: ObserverEvent["status"], count?: number): ObserverEvent {
    return { ...event(trackerId, id), status, ...(count ? { count } : {}) }
  }

  it("puts fully blocked trackers in denied and untouched trackers in reached", () => {
    const rollup = rollupValuationOutcomes([
      statusEvent("fullstory", "b1", "blocked", 3),
      statusEvent("google-analytics", "a1", "active", 2)
    ])

    expect(rollup.denied.trackerIds).toEqual(["fullstory"])
    expect(rollup.denied.requestCount).toBe(3)
    expect(rollup.denied.thisVisitUsd).toBeGreaterThan(0)
    expect(rollup.reached.trackerIds).toEqual(["google-analytics"])
    expect(rollup.shimmed.trackerIds).toEqual([])
  })

  it("counts a tracker as reached if even one of its requests got through — worst case is the honest case", () => {
    const rollup = rollupValuationOutcomes([statusEvent("fullstory", "b1", "blocked"), statusEvent("fullstory", "a1", "active")])

    expect(rollup.reached.trackerIds).toEqual(["fullstory"])
    expect(rollup.denied.trackerIds).toEqual([])
  })

  it("cannot_block counts as reached, never denied", () => {
    const rollup = rollupValuationOutcomes([statusEvent("fullstory", "c1", "cannot_block")])
    expect(rollup.reached.trackerIds).toEqual(["fullstory"])
  })

  it("mitigated-only trackers land in shimmed, even alongside blocks", () => {
    const rollup = rollupValuationOutcomes([
      statusEvent("google-analytics", "m1", "mitigated"),
      statusEvent("google-analytics", "b1", "blocked")
    ])

    expect(rollup.shimmed.trackerIds).toEqual(["google-analytics"])
    expect(rollup.denied.trackerIds).toEqual([])
  })

  it("denied bucket value equals the sum of its trackers' per-visit value", () => {
    const value = getTrackerValuation("fullstory")
    const rollup = rollupValuationOutcomes([statusEvent("fullstory", "b1", "blocked")])
    expect(rollup.denied.thisVisitUsd).toBeCloseTo((value?.perVisit.microdollars ?? 0) / 1_000_000, 10)
    expect(rollup.denied.annualLowUsd).toBe(value?.annual.low_usd)
    expect(rollup.denied.annualHighUsd).toBe(value?.annual.high_usd)
  })

  it("ignores events without a tracker id or without a valuation", () => {
    const rollup = rollupValuationOutcomes([statusEvent("not-a-tracker", "x1", "blocked"), event(undefined, "u1")])
    expect(rollup.denied.trackerIds).toEqual([])
    expect(rollup.reached.trackerIds).toEqual([])
  })
})

// Money-math invariants: the outcome split is a PARTITION of the same
// valued trackers the headline rollup prices — the three buckets must sum
// exactly to the whole, or two surfaces will show irreconcilable dollars.
describe("valuation math invariants", () => {
  const { trackers } = validateTrackerDatabase()
  const valuedIds = trackers.map((tracker) => tracker.id)

  function eventsWithSpreadStatuses(): ObserverEvent[] {
    const statuses: ObserverEvent["status"][] = ["active", "blocked", "mitigated", "cannot_block"]
    return valuedIds.flatMap((trackerId, index) => [
      {
        id: `spread:${trackerId}`,
        tabId: 1,
        origin: "https://example.test",
        observedAt: 100,
        source: "network" as const,
        trackerId,
        firstParty: false,
        eventType: "request_seen" as const,
        blockability: "network_blockable" as const,
        status: statuses[index % statuses.length]!,
        confidence: "confirmed" as const,
        evidence: ["Request matched tracker domain."]
      }
    ])
  }

  it("reached + denied + shimmed partition the full rollup exactly (per-visit and annual)", () => {
    const events = eventsWithSpreadStatuses()
    const whole = rollupObservedValuations(events)
    const parts = rollupValuationOutcomes(events)

    const bucketIds = [...parts.reached.trackerIds, ...parts.denied.trackerIds, ...parts.shimmed.trackerIds]
    expect(bucketIds.sort()).toEqual(whole.perTracker.map(({ trackerId }) => trackerId).sort())
    expect(new Set(bucketIds).size).toBe(bucketIds.length)

    const partsVisitUsd = parts.reached.thisVisitUsd + parts.denied.thisVisitUsd + parts.shimmed.thisVisitUsd
    expect(partsVisitUsd).toBeCloseTo(whole.thisVisitUsd, 9)

    const partsAnnualLow = parts.reached.annualLowUsd + parts.denied.annualLowUsd + parts.shimmed.annualLowUsd
    const partsAnnualHigh = parts.reached.annualHighUsd + parts.denied.annualHighUsd + parts.shimmed.annualHighUsd
    const wholeAnnualLow = whole.perTracker.reduce((sum, { value }) => sum + value.annual.low_usd, 0)
    const wholeAnnualHigh = whole.perTracker.reduce((sum, { value }) => sum + value.annual.high_usd, 0)
    expect(partsAnnualLow).toBeCloseTo(wholeAnnualLow, 9)
    expect(partsAnnualHigh).toBeCloseTo(wholeAnnualHigh, 9)
  })

  it("headline 'This visit' (reached) can never exceed the all-trackers total", () => {
    const events = eventsWithSpreadStatuses()
    const whole = rollupObservedValuations(events)
    const parts = rollupValuationOutcomes(events)
    expect(parts.reached.thisVisitUsd).toBeLessThanOrEqual(whole.thisVisitUsd + 1e-12)
  })
})

// Regressions from the adversarial money-math audit.
describe("outcome rollup audit regressions", () => {
  function statusEvent(trackerId: string, id: string, status: ObserverEvent["status"], count?: number): ObserverEvent {
    return { ...event(trackerId, id), status, ...(count ? { count } : {}) }
  }

  it("a mixed-status tracker's blocked requests never count as 'answered locally'", () => {
    // criteo: 2 mitigated requests + 3 blocked requests -> shimmed bucket,
    // but only the 2 mitigated ones were answered by the shim.
    const rollup = rollupValuationOutcomes([statusEvent("criteo", "m1", "mitigated", 2), statusEvent("criteo", "b1", "blocked", 3)])
    expect(rollup.shimmed.trackerIds).toEqual(["criteo"])
    expect(rollup.shimmed.requestCount).toBe(2)
  })

  it("splits revenue from site-paid cost inside every bucket", () => {
    const { trackers } = validateTrackerDatabase()
    const revenueTracker = trackers.find((tracker) => tracker.perPersonValue.valueType === "revenue")!
    const costTracker = trackers.find((tracker) => tracker.perPersonValue.valueType === "cost")!

    const rollup = rollupValuationOutcomes([statusEvent(revenueTracker.id, "b1", "blocked"), statusEvent(costTracker.id, "b2", "blocked")])

    expect(rollup.denied.costTrackerCount).toBe(1)
    expect(rollup.denied.annualRevenueLowUsd).toBe(revenueTracker.perPersonValue.annual.low_usd)
    expect(rollup.denied.annualRevenueHighUsd).toBe(revenueTracker.perPersonValue.annual.high_usd)
    expect(rollup.denied.thisVisitRevenueUsd).toBeCloseTo(revenueTracker.perPersonValue.perVisit.microdollars / 1_000_000, 10)
    // The total still includes both — the partition invariant is over totals.
    expect(rollup.denied.thisVisitUsd).toBeCloseTo(
      (revenueTracker.perPersonValue.perVisit.microdollars + costTracker.perPersonValue.perVisit.microdollars) / 1_000_000,
      10
    )
  })
})

describe("formatUsd audit regressions", () => {
  it("never renders a range whose low prints larger-looking than its high", () => {
    expect(formatUsd(0.996)).toBe("$1")
    expect(formatUsdRange(0.996, 1.2)).toBe("$1")
  })

  it("collapses ranges that round to the same string", () => {
    expect(formatUsdRange(4.6, 5.4)).toBe("$5")
    expect(formatUsdRange(4.6, 6.4)).toBe("$5–$6")
  })

  it("routes sub-cent values that round up to a cent into the cents format", () => {
    expect(formatUsd(0.00995)).toBe("$0.01")
    expect(formatUsd(0.0099)).toBe("$0.0099")
  })

  it("never prints a positive value as a string of zeros", () => {
    expect(formatUsd(1e-9)).toBe("<$0.00000001")
    expect(formatUsd(0)).toBe("$0")
  })
})
