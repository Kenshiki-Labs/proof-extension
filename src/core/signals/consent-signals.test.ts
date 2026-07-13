import { describe, expect, it } from "vitest"

import type { ObserverEvent } from "~core/domain/types"

import { consentSignalGlobalNames, matchConsentSignal, normalizeConsentSignal } from "./consent-signals"

function consentEvent(global: string | undefined, overrides: Partial<ObserverEvent> = {}): ObserverEvent {
  return {
    id: `consent:${global ?? "missing"}`,
    tabId: 1,
    origin: "https://example.test",
    observedAt: 1,
    source: "api-hook",
    firstParty: false,
    trackerId: "forged",
    companyId: "forged-company",
    eventType: "consent_signal_observed",
    blockability: "network_blockable",
    status: "blocked",
    confidence: "confirmed",
    evidence: ["forged evidence"],
    details: global ? { global } : {},
    ...overrides
  }
}

describe("consent signal signatures", () => {
  it("lists standardized consent globals separately from vendor SDK globals", () => {
    expect(consentSignalGlobalNames()).toContain("__tcfapi")
    expect(consentSignalGlobalNames()).toContain("__uspapi")
    expect(consentSignalGlobalNames()).toContain("__gpp")
    expect(matchConsentSignal("__fteSourcepointConsentConfig")).toMatchObject({ standard: "Sourcepoint CMP" })
  })

  it("rejects unknown globals", () => {
    expect(matchConsentSignal("analytics")).toBeNull()
  })
})

describe("normalizeConsentSignal", () => {
  it("rebuilds evidence and strips forged attribution/status", () => {
    const normalized = normalizeConsentSignal(consentEvent("__tcfapi"))

    expect(normalized.trackerId).toBeUndefined()
    expect(normalized.companyId).toBeUndefined()
    expect(normalized.firstParty).toBe(true)
    expect(normalized.blockability).toBe("observable_only")
    expect(normalized.status).toBe("active")
    expect(normalized.confidence).toBe("confirmed")
    expect(normalized.evidenceTier).toBe("observed")
    expect(normalized.evidence[0]).toContain("IAB TCF")
    expect(normalized.details).toEqual({ global: "__tcfapi", standard: "IAB TCF v2", signalName: "IAB TCF consent API" })
  })

  it("keeps unknown reported globals weak and unattributed", () => {
    const normalized = normalizeConsentSignal(consentEvent("notReviewed"))

    expect(normalized.trackerId).toBeUndefined()
    expect(normalized.companyId).toBeUndefined()
    expect(normalized.confidence).toBe("weak")
    expect(normalized.blockability).toBe("observable_only")
  })
})
