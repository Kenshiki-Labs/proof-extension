import { describe, expect, it } from "vitest"

import type { ObserverEvent } from "~core/domain/types"
import { createEmptySiteSummary, upsertEvent } from "~core/state/summaries"

import { badgeTextForEventCount, badgeTextForSummary } from "./badge"

function event(overrides: Partial<ObserverEvent> = {}): ObserverEvent {
  return {
    id: "event-1",
    tabId: 1,
    origin: "https://example.test",
    observedAt: 1,
    source: "network",
    firstParty: false,
    eventType: "request_seen",
    blockability: "observable_only",
    status: "active",
    confidence: "confirmed",
    evidence: ["Observed."],
    ...overrides
  }
}

describe("badge text", () => {
  it("formats event counts for the action badge", () => {
    expect(badgeTextForEventCount(0)).toBe("")
    expect(badgeTextForEventCount(1)).toBe("1")
    expect(badgeTextForEventCount(99)).toBe("99")
    expect(badgeTextForEventCount(100)).toBe("99+")
  })

  it("shows the distinct-watcher headline count, not the raw event count", () => {
    // The badge must equal the popup verdict's watcher number. Two watchers
    // (a named tracker + one unclassified third-party host); first-party
    // storage, the exposure scan, and diagnostics are never watchers.
    let summary = createEmptySiteSummary("https://example.test", 1)
    summary = upsertEvent(summary, event({ id: "tracker", trackerId: "meta-pixel", companyId: "meta" }))
    summary = upsertEvent(summary, event({ id: "unknown", details: { host: "cdn.example" }, evidenceTier: "observed" }))
    summary = upsertEvent(summary, event({ id: "storage", firstParty: true, source: "api-hook", eventType: "storage_write" }))
    summary = upsertEvent(summary, event({ id: "exposure", firstParty: true, source: "extension-scan", eventType: "browser_surface" }))
    summary = upsertEvent(summary, event({ id: "diag", firstParty: true, source: "content", eventType: "extension_diagnostic" }))

    expect(badgeTextForSummary(summary)).toBe("2")
  })

  it("clears when only diagnostics or exposure scans are present", () => {
    let summary = createEmptySiteSummary("https://example.test", 1)
    summary = upsertEvent(summary, event({ id: "exposure", firstParty: true, source: "extension-scan", eventType: "browser_surface" }))
    summary = upsertEvent(summary, event({ id: "diag", firstParty: true, source: "content", eventType: "extension_diagnostic" }))

    expect(badgeTextForSummary(summary)).toBe("")
  })
})
