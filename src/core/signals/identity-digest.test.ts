import { describe, expect, it } from "vitest"

import type { ObserverEvent } from "~core/domain/types"

import { normalizeIdentityDigestEvent } from "./identity-digest"

function digestEvent(overrides: Partial<ObserverEvent> = {}): ObserverEvent {
  return {
    id: "digest:1",
    tabId: 1,
    origin: "https://example.test",
    observedAt: 1,
    source: "api-hook",
    firstParty: false,
    trackerId: "forged",
    companyId: "forged-company",
    eventType: "identity_digest_observed",
    blockability: "network_blockable",
    status: "blocked",
    confidence: "confirmed",
    evidence: ["forged evidence with person@example.test"],
    details: { algorithm: "sha-256", inputBytes: 19, digest: "forged-digest", value: "person@example.test" },
    ...overrides
  }
}

describe("normalizeIdentityDigestEvent", () => {
  it("rebuilds SHA-256 digest evidence without values or forged claims", () => {
    const normalized = normalizeIdentityDigestEvent(digestEvent())

    expect(normalized.trackerId).toBeUndefined()
    expect(normalized.companyId).toBeUndefined()
    expect(normalized.firstParty).toBe(true)
    expect(normalized.policyLabel).toBe("behavioral_profiling")
    expect(normalized.blockability).toBe("observable_only")
    expect(normalized.status).toBe("active")
    expect(normalized.confidence).toBe("probable")
    expect(normalized.evidenceTier).toBe("observed")
    expect(normalized.details).toEqual({ algorithm: "SHA-256", inputBytes: 19 })
    expect(JSON.stringify(normalized)).not.toContain("person@example.test")
    expect(JSON.stringify(normalized)).not.toContain("forged-digest")
  })
})