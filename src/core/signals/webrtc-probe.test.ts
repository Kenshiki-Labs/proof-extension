import { describe, expect, it } from "vitest"

import type { ObserverEvent } from "~core/domain/types"
import { normalizeWebrtcProbeEvent } from "~core/signals/webrtc-probe"

function webrtcEvent(overrides: Partial<ObserverEvent> = {}): ObserverEvent {
  return {
    id: "webrtc_probe:https://example.com:RTCPeerConnection",
    tabId: 1,
    origin: "https://example.com",
    observedAt: 1_000,
    source: "api-hook",
    firstParty: true,
    policyLabel: "unknown_first_party",
    eventType: "webrtc_probe",
    blockability: "observable_only",
    status: "active",
    confidence: "confirmed",
    evidence: ["Page-authored evidence that must never be stored."],
    details: { api: "RTCPeerConnection" },
    ...overrides
  }
}

describe("normalizeWebrtcProbeEvent", () => {
  it("passes non-webrtc events through untouched", () => {
    const event = webrtcEvent({ eventType: "storage_write" })
    expect(normalizeWebrtcProbeEvent(event)).toBe(event)
  })

  it("rebuilds evidence and never stores the page-authored prose", () => {
    const normalized = normalizeWebrtcProbeEvent(webrtcEvent())

    expect(normalized.evidence[0]).toContain("WebRTC")
    expect(normalized.evidence[0]).toContain("local network")
    expect(normalized.evidence).not.toContain("Page-authored evidence that must never be stored.")
    expect(normalized.blockability).toBe("observable_only")
    expect(normalized.status).toBe("active")
    expect(normalized.details).toEqual({ api: "RTCPeerConnection" })
  })

  it("strips attribution a page context must not claim", () => {
    const normalized = normalizeWebrtcProbeEvent(webrtcEvent({ trackerId: "forged", companyId: "forged", policyLabel: "fingerprinting" }))

    expect(normalized.trackerId).toBeUndefined()
    expect(normalized.companyId).toBeUndefined()
    expect(normalized.policyLabel).toBe("unknown_first_party")
  })

  it("falls back to a canonical api name when the metadata is malformed", () => {
    const normalized = normalizeWebrtcProbeEvent(webrtcEvent({ details: { api: "evilConstructor" } }))
    expect(normalized.details).toEqual({ api: "RTCPeerConnection" })
  })

  it("accepts the webkit-prefixed constructor name", () => {
    const normalized = normalizeWebrtcProbeEvent(webrtcEvent({ details: { api: "webkitRTCPeerConnection" } }))
    expect(normalized.details).toEqual({ api: "webkitRTCPeerConnection" })
  })
})
