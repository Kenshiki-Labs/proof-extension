import { describe, expect, it } from "vitest"

import type { ObserverEvent } from "~core/domain/types"
import { untrustedObservedEventReason } from "./message-guards"

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

  it("still allows mitigated status for future content mitigation hooks", () => {
    expect(untrustedObservedEventReason(event({ eventType: "canvas_read", status: "mitigated", source: "api-hook" }))).toBeNull()
  })
})
