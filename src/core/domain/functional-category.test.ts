import { describe, expect, it } from "vitest"

import { validateTrackerDatabase } from "~core/db/validate"
import type { ObserverEvent } from "~core/domain/types"
import { countWatchingObservers } from "~core/domain/observer-counts"
import { countByFunctionalCategory, functionalCategoryBreakdown, getFunctionalCategory } from "./functional-category"

function event(overrides: Partial<ObserverEvent>): ObserverEvent {
  return {
    id: "event",
    tabId: 1,
    origin: "https://example.test",
    observedAt: 100,
    source: "network",
    firstParty: false,
    eventType: "request_seen",
    blockability: "observable_only",
    status: "active",
    confidence: "confirmed",
    evidenceTier: "observed",
    evidence: ["Observed."],
    ...overrides
  }
}

describe("getFunctionalCategory", () => {
  it("maps known raw DB categories into coarse buckets", () => {
    expect(getFunctionalCategory("google-ads")).toBe("advertising")
    expect(getFunctionalCategory("fullstory")).toBe("session_replay")
    expect(getFunctionalCategory("liveramp")).toBe("identity_data")
    expect(getFunctionalCategory("sourcepoint")).toBe("consent_management")
  })

  it("returns unidentified for no tracker id, and every DB category maps to a real bucket", () => {
    expect(getFunctionalCategory(undefined)).toBe("unidentified")
    expect(getFunctionalCategory("not-a-real-tracker-id")).toBe("unidentified")

    const { trackers } = validateTrackerDatabase()
    for (const tracker of trackers) {
      expect(getFunctionalCategory(tracker.id), tracker.id).not.toBe("unidentified")
    }
  })
})

describe("countByFunctionalCategory / functionalCategoryBreakdown", () => {
  it("groups distinct parties by function, folding repeats into one count", () => {
    const events = [
      event({ id: "e1", trackerId: "google-ads", companyId: "google-ads" }),
      event({ id: "e2", trackerId: "google-ads", companyId: "google-ads", eventType: "sdk_detected", source: "api-hook" }),
      event({ id: "e3", trackerId: "fullstory", companyId: "fullstory" }),
      event({ id: "e4", details: { host: "sb.scorecardresearch.com" } })
    ]

    expect(countByFunctionalCategory(events)).toEqual({ advertising: 1, session_replay: 1, unidentified: 1 })
    expect(functionalCategoryBreakdown(events)).toEqual([
      { category: "advertising", label: "Advertising", count: 1 },
      { category: "session_replay", label: "Session Replay", count: 1 },
      { category: "unidentified", label: "Unidentified", count: 1 }
    ])
  })

  it("sums to exactly the Watching headline count — same party filter, one source of truth", () => {
    const events = [
      event({ id: "e1", trackerId: "google-ads", companyId: "google-ads" }),
      event({ id: "e2", trackerId: "fullstory", companyId: "fullstory", status: "blocked" }),
      event({ id: "e3", details: { host: "cdn.example" } }),
      event({ id: "e4", firstParty: true, details: { host: "internal.example" } })
    ]

    const breakdown = functionalCategoryBreakdown(events)
    const total = breakdown.reduce((sum, entry) => sum + entry.count, 0)
    expect(total).toBe(countWatchingObservers(events))
  })

  it("excludes first-party, blocked, and diagnostic/exposure-scan events", () => {
    const events = [
      { ...event({ id: "fp", details: { host: "cdn.example" } }), firstParty: true },
      { ...event({ id: "blocked", trackerId: "google-ads", companyId: "google-ads" }), status: "blocked" as const },
      event({ id: "diag", source: "content" as const, eventType: "extension_diagnostic" as const, firstParty: true }),
      event({ id: "scan", source: "extension-scan" as const, eventType: "browser_surface" as const, firstParty: true })
    ]
    expect(countByFunctionalCategory(events)).toEqual({})
  })
})
