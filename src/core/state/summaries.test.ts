import { describe, expect, it } from "vitest"

import type { ObserverEvent, PageError } from "~core/domain/types"
import { createEmptySiteSummary, normalizeSiteSummary, pruneExpiredEvents, recordPageError, upsertEvent } from "./summaries"

function event(overrides: Partial<ObserverEvent> = {}): ObserverEvent {
  return {
    id: "event-1",
    tabId: 1,
    origin: "https://example.test",
    observedAt: 1,
    source: "api-hook",
    firstParty: true,
    policyLabel: "fingerprinting",
    eventType: "canvas_read",
    blockability: "content_mitigatable",
    status: "active",
    confidence: "probable",
    evidence: ["Canvas read observed."],
    ...overrides
  }
}

describe("upsertEvent", () => {
  it("rolls observer events into status-specific summary buckets", () => {
    const summary = upsertEvent(createEmptySiteSummary("https://example.test", 1), event())

    expect(summary.incomplete).toBe(false)
    expect(summary.activeCompanies).toEqual(["https://example.test"])
    expect(summary.exposedSignals).toEqual(["canvas_read"])
  })

  it("replaces existing events by id", () => {
    const first = upsertEvent(createEmptySiteSummary("https://example.test", 1), event())
    const second = upsertEvent(first, event({ status: "mitigated" }))

    expect(second.events).toHaveLength(1)
    expect(second.mitigatedCompanies).toEqual(["https://example.test"])
    expect(second.activeCompanies).toEqual([])
  })

  it("caps retained events per tab", () => {
    const first = upsertEvent(createEmptySiteSummary("https://example.test", 1), event({ id: "event-1" }), 2)
    const second = upsertEvent(first, event({ id: "event-2", eventType: "webgl_query" }), 2)
    const third = upsertEvent(second, event({ id: "event-3", eventType: "audio_fingerprint" }), 2)

    expect(third.events.map((item) => item.id)).toEqual(["event-2", "event-3"])
    expect(third.exposedSignals).toEqual(["webgl_query", "audio_fingerprint"])
  })

  it("uses tracker and unknown keys for non-first-party events", () => {
    const first = upsertEvent(
      createEmptySiteSummary("https://example.test", 1),
      event({ firstParty: false, status: "blocked", trackerId: "fullstory" })
    )
    const second = upsertEvent(first, event({ firstParty: false, id: "event-2", status: "cannot_block" }))

    expect(second.blockedCompanies).toEqual(["fullstory"])
    expect(second.cannotBlockSignals).toEqual(["canvas_read"])
  })

  it("prefers explicit company ids when rebuilding summary buckets", () => {
    const summary = upsertEvent(
      createEmptySiteSummary("https://example.test", 1),
      event({ companyId: "google", firstParty: false, source: "network", trackerId: "google-analytics" })
    )

    expect(summary.activeCompanies).toEqual(["google"])
  })
})

describe("normalizeSiteSummary", () => {
  it("fills missing fields from legacy stored summaries", () => {
    expect(normalizeSiteSummary({}, "https://example.test", 7)).toMatchObject({
      origin: "https://example.test",
      tabId: 7,
      activeCompanies: [],
      blockedCompanies: [],
      mitigatedCompanies: [],
      exposedSignals: [],
      cannotBlockSignals: [],
      events: [],
      pageErrors: [],
      incomplete: true
    })
  })

  it("preserves fields from current stored summaries", () => {
    const current = createEmptySiteSummary("https://stored.test", 2)
    const normalized = normalizeSiteSummary({ ...current, incomplete: false, updatedAt: 123 }, "https://fallback.test", 9)

    expect(normalized).toEqual({ ...current, incomplete: false, updatedAt: 123 })
  })
})

describe("pruneExpiredEvents", () => {
  it("returns the same summary when every event is inside retention", () => {
    const summary = upsertEvent(
      createEmptySiteSummary("https://example.test", 1),
      event({ observedAt: 1000 })
    )

    expect(pruneExpiredEvents(summary, 1, 2000)).toBe(summary)
  })

  it("drops expired events and rebuilds derived summary fields", () => {
    const now = 10 * 24 * 60 * 60 * 1000
    const first = upsertEvent(
      createEmptySiteSummary("https://example.test", 1),
      event({ id: "expired", observedAt: 1, status: "blocked", trackerId: "fullstory" })
    )
    const second = upsertEvent(first, event({ id: "fresh", observedAt: now, status: "active" }))
    const pruned = pruneExpiredEvents(second, 1, now)

    expect(pruned.events.map((item) => item.id)).toEqual(["fresh"])
    expect(pruned.blockedCompanies).toEqual([])
    expect(pruned.activeCompanies).toEqual(["https://example.test"])
  })
})

describe("recordPageError", () => {
  function pageError(id: string): PageError {
    return { id, message: `Error ${id}`, observedAt: Number(id.replace("error-", "")) }
  }

  it("retains recent page errors without changing event buckets", () => {
    const summary = upsertEvent(createEmptySiteSummary("https://example.test", 1), event())
    const withError = recordPageError(summary, pageError("error-1"))

    expect(withError.pageErrors).toEqual([pageError("error-1")])
    expect(withError.events).toEqual(summary.events)
    expect(withError.activeCompanies).toEqual(summary.activeCompanies)
  })

  it("caps retained page errors", () => {
    const summary = createEmptySiteSummary("https://example.test", 1)
    const withErrors = ["error-1", "error-2", "error-3"].reduce(
      (current, id) => recordPageError(current, pageError(id), 2),
      summary
    )

    expect(withErrors.pageErrors.map((item) => item.id)).toEqual(["error-2", "error-3"])
  })
})