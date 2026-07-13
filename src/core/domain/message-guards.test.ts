import { describe, expect, it } from "vitest"

import type { ObserverEvent } from "~core/domain/types"
import { stripPageSuppliedAttribution, untrustedObservedEventReason } from "./message-guards"

function event(overrides: Partial<ObserverEvent> = {}): ObserverEvent {
  return {
    id: "event-1",
    tabId: 1,
    origin: "https://example.test",
    observedAt: 100,
    source: "content",
    firstParty: true,
    eventType: "script_injected",
    blockability: "observable_only",
    status: "active",
    confidence: "confirmed",
    evidence: ["Script inserted after page load."],
    ...overrides
  }
}

describe("untrustedObservedEventReason", () => {
  it("accepts legitimate content and api-hook events", () => {
    expect(untrustedObservedEventReason(event())).toBeNull()
    expect(untrustedObservedEventReason(event({ source: "api-hook", eventType: "sdk_detected" }))).toBeNull()
    expect(untrustedObservedEventReason(event({ source: "content", eventType: "storage_write" }))).toBeNull()
    expect(untrustedObservedEventReason(event({ source: "extension-scan", eventType: "browser_surface" }))).toBeNull()
  })

  it("rejects events claiming the background-only network source", () => {
    expect(untrustedObservedEventReason(event({ source: "network", eventType: "request_seen" }))).toBe("network_source_reserved")
  })

  it("rejects network-reserved event types regardless of claimed source", () => {
    expect(untrustedObservedEventReason(event({ eventType: "request_seen" }))).toBe("network_event_type_reserved")
    expect(untrustedObservedEventReason(event({ eventType: "request_blocked" }))).toBe("network_event_type_reserved")
    expect(untrustedObservedEventReason(event({ eventType: "cookie_sync" }))).toBe("network_event_type_reserved")
    expect(untrustedObservedEventReason(event({ eventType: "cache_validator_seen" }))).toBe("network_event_type_reserved")
  })

  it("rejects forged blocked-status claims from the page channel", () => {
    expect(untrustedObservedEventReason(event({ eventType: "canvas_read", status: "blocked" }))).toBe("blocked_status_reserved")
  })

  it("allows mitigated status only for canvas_read, whose normalizer re-derives it from settings", () => {
    expect(untrustedObservedEventReason(event({ eventType: "canvas_read", status: "mitigated", source: "api-hook" }))).toBeNull()
  })

  it("rejects a forged mitigated status on any event type the background does not re-derive", () => {
    // A hostile page marking an observation "mitigated" would otherwise land
    // in mitigatedCompanies and claim protection that never happened.
    for (const eventType of ["webgl_query", "font_enumeration", "audio_fingerprint", "webrtc_probe", "sdk_detected"] as const) {
      expect(untrustedObservedEventReason(event({ eventType, status: "mitigated", source: "api-hook" }))).toBe(
        "mitigated_status_reserved"
      )
    }
  })
})

describe("stripPageSuppliedAttribution", () => {
  it("clears trackerId and companyId a page tried to inject", () => {
    const forged = event({ eventType: "webgl_query", trackerId: "google-analytics", companyId: "google", confidence: "confirmed" })
    const stripped = stripPageSuppliedAttribution(forged)
    expect(stripped.trackerId).toBeUndefined()
    expect(stripped.companyId).toBeUndefined()
    // Everything else is left for the normalizers to decide.
    expect(stripped.confidence).toBe("confirmed")
  })

  it("returns the same object when there is nothing to strip", () => {
    const clean = event({ eventType: "storage_write" })
    expect(stripPageSuppliedAttribution(clean)).toBe(clean)
  })
})
