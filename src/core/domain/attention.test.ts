import { describe, expect, it } from "vitest"

import type { ObserverEvent, SiteSummary } from "~core/domain/types"
import { EMPTY_SUMMARY } from "~core/report/display"
import { attentionScore, attentionTier, buildVerdict, rankObservers } from "./attention"

function event(overrides: Partial<ObserverEvent>): ObserverEvent {
  return {
    id: "event",
    tabId: 1,
    origin: "https://example.test",
    observedAt: 100,
    source: "network",
    firstParty: false,
    eventType: "request_seen",
    blockability: "network_blockable",
    status: "active",
    confidence: "confirmed",
    evidence: ["Request matched tracker domain."],
    ...overrides
  }
}

describe("attention tiers", () => {
  it("maps who-it-serves to glanceable colors", () => {
    expect(attentionTier(event({ trackerId: "liveramp" }))).toBe("red")
    expect(attentionTier(event({ trackerId: "meta-pixel" }))).toBe("amber")
    expect(attentionTier(event({ trackerId: "hotjar" }))).toBe("gray")
    expect(attentionTier(event({ trackerId: "intercom" }))).toBe("gray")
    expect(attentionTier(event({}))).toBe("gray") // unattributed
  })
})

describe("attention score", () => {
  it("ranks no-trade identity brokers above site tooling", () => {
    expect(attentionScore(event({ trackerId: "liveramp" }))).toBeGreaterThan(attentionScore(event({ trackerId: "hotjar" })))
  })

  it("within a tier, money ranks: Meta above Snap", () => {
    expect(attentionScore(event({ trackerId: "meta-pixel" }))).toBeGreaterThan(attentionScore(event({ trackerId: "snap-pixel" })))
  })

  it("tier dominates money in ranking: a broker outranks a walled garden", () => {
    // LiveRamp ($0.50–5/yr, no trade) must outrank Google Ads ($420–500/yr,
    // ads trade): the classification is the harm story, enforced by the
    // tier-first sort rather than by weight tuning.
    const ranked = rankObservers([
      event({ id: "e1", trackerId: "google-ads" }),
      event({ id: "e2", trackerId: "liveramp" })
    ])
    expect(ranked.map((item) => item.observation.event.trackerId)).toEqual(["liveramp", "google-ads"])
  })

  it("blocked observers drop sharply — handled, not urgent", () => {
    const active = attentionScore(event({ trackerId: "meta-pixel" }))
    const blocked = attentionScore(event({ trackerId: "meta-pixel", eventType: "request_blocked", status: "blocked" }))
    expect(blocked).toBeLessThan(active * 0.4)
  })
})

describe("rankObservers", () => {
  it("returns worst-first and excludes non-observer evidence families", () => {
    const ranked = rankObservers([
      event({ id: "e1", trackerId: "hotjar" }),
      event({ id: "e2", trackerId: "liveramp" }),
      event({ id: "e3", source: "extension-scan", eventType: "browser_surface", blockability: "observable_only", firstParty: true }),
      event({ id: "e4", firstParty: false, trackerId: undefined, companyId: undefined, blockability: "observable_only", evidenceTier: "observed", details: { host: "cdn.example" } }),
      event({ id: "e5", firstParty: true, eventType: "storage_write", blockability: "observable_only", evidenceTier: "observed", details: { area: "sessionStorage", op: "set", key: "theme" } }),
      event({ id: "e6", firstParty: true, eventType: "cache_validator_seen", blockability: "observable_only", evidenceTier: "observed", details: { headerName: "ETag", host: "example.test" } })
    ])
    expect(ranked[0]?.observation.event.trackerId).toBe("liveramp")
    expect(ranked.some((item) => item.observation.event.source === "extension-scan")).toBe(false)
    expect(ranked.map((item) => item.observation.event.id)).toEqual(["e2", "e1"])
  })
})

describe("buildVerdict", () => {
  const summary: SiteSummary = {
    ...EMPTY_SUMMARY,
    origin: "https://example.test",
    tabId: 1,
    activeCompanies: ["liveramp", "meta", "hotjar"],
    events: [
      event({ id: "e1", trackerId: "liveramp", companyId: "liveramp" }),
      event({ id: "e2", trackerId: "meta-pixel", companyId: "meta" }),
      event({ id: "e3", trackerId: "hotjar", companyId: "hotjar" }),
      event({ id: "e4", trackerId: "criteo", companyId: "criteo" })
    ]
  }

  it("counts tiers once per tracker and prices the no-trade set", () => {
    const verdict = buildVerdict(summary)
    expect(verdict.companiesWatching).toBe(4) // all four observed third parties, tiered or not
    expect(verdict.tierCounts).toEqual({ red: 2, amber: 1, gray: 1 })
    expect(verdict.noTradeCount).toBe(2)
    expect(verdict.noTradeAnnualLowUsd).toBeCloseTo(0.5 + 2, 6)
    expect(verdict.topObservers).toHaveLength(3)
    expect(verdict.topObservers[0]?.tier).toBe("red")
  })

  it("does not turn storage or unclassified host evidence into verdict observers", () => {
    const verdict = buildVerdict({
      ...EMPTY_SUMMARY,
      origin: "https://example.test",
      tabId: 1,
      events: [
        event({ id: "unknown-host", firstParty: false, trackerId: undefined, companyId: undefined, blockability: "observable_only", evidenceTier: "observed", details: { host: "cdn.example" } }),
        event({ id: "session-storage", firstParty: true, eventType: "storage_write", blockability: "observable_only", evidenceTier: "observed", details: { area: "sessionStorage", op: "set", key: "theme" } }),
        event({ id: "cache-validator", firstParty: true, eventType: "cache_validator_seen", blockability: "observable_only", evidenceTier: "observed", details: { headerName: "ETag", host: "example.test" } })
      ]
    })

    expect(verdict.tierCounts).toEqual({ red: 0, amber: 0, gray: 0 })
    expect(verdict.topObservers).toEqual([])
  })
})
