import { describe, expect, it } from "vitest"

import type { ObserverEvent } from "~core/domain/types"
import { createEmptySiteSummary, upsertEvent } from "./summaries"

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

  it("uses tracker and unknown keys for non-first-party events", () => {
    const first = upsertEvent(
      createEmptySiteSummary("https://example.test", 1),
      event({ firstParty: false, status: "blocked", trackerId: "fullstory" })
    )
    const second = upsertEvent(first, event({ firstParty: false, id: "event-2", status: "cannot_block" }))

    expect(second.blockedCompanies).toEqual(["fullstory"])
    expect(second.cannotBlockSignals).toEqual(["canvas_read"])
  })
})