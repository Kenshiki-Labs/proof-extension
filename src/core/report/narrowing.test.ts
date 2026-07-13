import { describe, expect, it } from "vitest"

import type { ObserverEvent } from "~core/domain/types"

import { buildNarrowingModel, formatCandidates, POPULATION_BASE } from "./narrowing"

function event(overrides: Partial<ObserverEvent>): ObserverEvent {
  return {
    id: "event",
    tabId: 1,
    origin: "https://example.test",
    observedAt: 100,
    source: "extension-scan",
    firstParty: true,
    eventType: "browser_surface",
    blockability: "observable_only",
    status: "active",
    confidence: "confirmed",
    evidence: ["Browser APIs exposed passive surface fields to the extension scan."],
    ...overrides
  }
}

describe("buildNarrowingModel", () => {
  it("returns the population baseline when no readable surface exists", () => {
    const model = buildNarrowingModel([])

    expect(model.steps).toEqual([])
    expect(model.values).toEqual([])
    expect(model.remaining).toBe(POPULATION_BASE)
    expect(model.cumulativeBits).toBe(0)
  })

  it("uses proof-app bit weights for readable browser surface values", () => {
    const model = buildNarrowingModel([
      event({
        details: {
          timezone: "America/Denver",
          screen: "1512x982",
          pixelRatio: 2,
          platform: "MacIntel",
          language: "en-US"
        }
      })
    ])

    expect(model.values).toEqual(["America/Denver", "1512x982 @2x", "MacIntel · en-US"])
    expect(model.steps.map((step) => step.key)).toEqual(["timezone", "screen", "platformLanguage"])
    expect(model.cumulativeBits).toBeCloseTo(3.04 + 4.83 + 2.1, 5)
    expect(model.remaining).toBeCloseTo(POPULATION_BASE / 2 ** (3.04 + 4.83 + 2.1), 5)
  })

  it("adds network contact and consent context without treating them as entropy steps", () => {
    const model = buildNarrowingModel([
      event({ details: { timezone: "America/Denver" } }),
      event({ id: "consent", source: "api-hook", eventType: "consent_signal_observed", policyLabel: "unknown_first_party" }),
      event({
        id: "request",
        source: "network",
        firstParty: false,
        eventType: "request_seen",
        count: 3,
        details: { host: "cdn.example" }
      })
    ])

    expect(model.hasConsentSignal).toBe(true)
    expect(model.thirdPartyContacts).toBe(3) // raw diagnostic count, kept on the model
    // The mirror lists device surfaces read FROM the browser only — an
    // outbound third-party contact count (inflated by cache-validator merges)
    // is neither that category nor a defensible "IP left N times" claim.
    expect(model.values).not.toContain("IP on 3 third-party contacts")
    expect(model.steps).toHaveLength(1)
  })
})

describe("formatCandidates", () => {
  it("formats candidate pools like the proof app model", () => {
    expect(formatCandidates(165_000_000)).toBe("165,000,000")
    expect(formatCandidates(315)).toBe("315.0")
    expect(formatCandidates(0.3)).toBe("0.30")
    expect(formatCandidates(0.001)).toBe("< 1 — unique in this model")
  })
})
