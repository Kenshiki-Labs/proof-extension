import { describe, expect, it } from "vitest"

import type { ObserverEvent } from "~core/domain/types"
import { normalizeDeviceFieldReadEvent } from "~core/signals/device-field"

function deviceFieldEvent(overrides: Partial<ObserverEvent> = {}): ObserverEvent {
  return {
    id: "device_field_read:https://example.com:hardwareConcurrency",
    tabId: 1,
    origin: "https://example.com",
    observedAt: 1_000,
    source: "api-hook",
    firstParty: true,
    policyLabel: "unknown_first_party",
    eventType: "device_field_read",
    blockability: "observable_only",
    status: "active",
    confidence: "confirmed",
    evidence: ["Page-authored evidence that must never be stored."],
    details: { field: "hardwareConcurrency" },
    ...overrides
  }
}

describe("normalizeDeviceFieldReadEvent", () => {
  it("passes non-matching events through untouched", () => {
    const event = deviceFieldEvent({ eventType: "storage_write" })
    expect(normalizeDeviceFieldReadEvent(event)).toBe(event)
  })

  it("rebuilds evidence from the field name and never stores the page prose", () => {
    const normalized = normalizeDeviceFieldReadEvent(deviceFieldEvent())

    expect(normalized.evidence[0]).toContain("processor cores")
    expect(normalized.evidence[0]).toContain("value was not recorded")
    expect(normalized.evidence).not.toContain("Page-authored evidence that must never be stored.")
    expect(normalized.confidence).toBe("confirmed")
    expect(normalized.details).toEqual({ field: "hardwareConcurrency" })
  })

  it("maps each known field to its own phrase", () => {
    expect(normalizeDeviceFieldReadEvent(deviceFieldEvent({ details: { field: "timeZone" } })).evidence[0]).toContain("time zone")
    expect(normalizeDeviceFieldReadEvent(deviceFieldEvent({ details: { field: "colorDepth" } })).evidence[0]).toContain("color depth")
    expect(normalizeDeviceFieldReadEvent(deviceFieldEvent({ details: { field: "languages" } })).evidence[0]).toContain("languages")
  })

  it("records an unknown field generically without echoing its label", () => {
    const normalized = normalizeDeviceFieldReadEvent(deviceFieldEvent({ details: { field: "evilField" } }))

    expect(normalized.confidence).toBe("weak")
    expect(normalized.details).toBeUndefined()
    expect(normalized.evidence[0]).not.toContain("evilField")
    expect(normalized.evidence[0]).toContain("device characteristic")
  })

  it("strips attribution a page context must not claim", () => {
    const normalized = normalizeDeviceFieldReadEvent(
      deviceFieldEvent({ trackerId: "forged", companyId: "forged", policyLabel: "fingerprinting" })
    )

    expect(normalized.trackerId).toBeUndefined()
    expect(normalized.companyId).toBeUndefined()
    expect(normalized.policyLabel).toBe("unknown_first_party")
    expect(normalized.blockability).toBe("observable_only")
  })
})
