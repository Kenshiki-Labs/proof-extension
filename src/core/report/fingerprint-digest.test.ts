import { describe, expect, it } from "vitest"

import type { ObserverEvent } from "~core/domain/types"
import { fingerprintReadKinds, fingerprintReadTakeaway } from "~core/report/fingerprint-digest"

function event(overrides: Partial<ObserverEvent> = {}): ObserverEvent {
  return {
    id: "e",
    tabId: 1,
    origin: "https://example.com",
    observedAt: 1_000,
    source: "api-hook",
    firstParty: true,
    policyLabel: "unknown_first_party",
    eventType: "canvas_read",
    blockability: "observable_only",
    status: "active",
    confidence: "confirmed",
    evidence: ["x"],
    ...overrides
  }
}

describe("fingerprintReadKinds", () => {
  it("returns nothing when the page read no device surface", () => {
    expect(fingerprintReadKinds([event({ eventType: "storage_write" })])).toEqual([])
  })

  it("lists distinct fingerprint surfaces most-alarming first", () => {
    const kinds = fingerprintReadKinds([
      event({ eventType: "device_field_read" }),
      event({ eventType: "canvas_read" }),
      event({ eventType: "webrtc_probe" }),
      event({ eventType: "canvas_read" }) // duplicate collapses
    ])
    expect(kinds[0]).toContain("WebRTC")
    expect(kinds).toContain("canvas")
    expect(kinds.filter((k) => k === "canvas")).toHaveLength(1)
    // WebRTC (most alarming) precedes device details (least).
    expect(kinds.indexOf(kinds.find((k) => k.includes("WebRTC"))!)).toBeLessThan(
      kinds.indexOf(kinds.find((k) => k.includes("device details"))!)
    )
  })

  it("excludes the capability scan (extension-scan source) — that is not a page read", () => {
    expect(fingerprintReadKinds([event({ eventType: "browser_surface", source: "extension-scan" })])).toEqual([])
  })

  it("counts a mitigated canvas read as a read that still happened", () => {
    expect(fingerprintReadKinds([event({ eventType: "canvas_read", status: "mitigated" })])).toEqual(["canvas"])
  })
})

describe("fingerprintReadTakeaway", () => {
  it("is null when nothing was read", () => {
    expect(fingerprintReadTakeaway([event({ eventType: "cookie_observed" })])).toBeNull()
  })

  it("names the surfaces and frames them as first-party fingerprinting", () => {
    const takeaway = fingerprintReadTakeaway([event({ eventType: "webrtc_probe" }), event({ eventType: "device_field_read" })])!
    expect(takeaway).toContain("first-party fingerprinting")
    expect(takeaway).toContain("WebRTC")
    expect(takeaway).toContain("device details")
  })
})
