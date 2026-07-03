import { describe, expect, it } from "vitest"

import type { ObserverEvent } from "~core/domain/types"
import { getObserverRemediation } from "./remediation"

function event(overrides: Partial<ObserverEvent> = {}): ObserverEvent {
  return {
    id: "event-1",
    tabId: 1,
    origin: "https://example.test",
    observedAt: 1,
    source: "network",
    trackerId: "fullstory",
    companyId: "fullstory",
    firstParty: false,
    eventType: "request_seen",
    blockability: "network_blockable",
    status: "active",
    confidence: "confirmed",
    evidence: ["Request matched fullstory domain fullstory.com."],
    ...overrides
  }
}

describe("getObserverRemediation", () => {
  it("joins observer events to tracker, company, and remediation metadata", () => {
    const details = getObserverRemediation(event())

    expect(details?.observerName).toBe("FullStory")
    expect(details?.categoryLabels).toContain("session replay")
    expect(details?.collects).toContain("scrolls")
    expect(details?.futureCollectionUrl).toContain("fullstory.com")
    expect(details?.deletionUrl).toContain("fullstory.com")
    expect(details?.explanation.displayName).toBe("FullStory")
    expect(details?.explanation.observedData.length).toBeGreaterThan(0)
    expect(details?.explanation.whatBlockingDoesNotChange.join(" ")).toMatch(/does not delete/i)
  })

  it("returns null when an event is not backed by a known tracker", () => {
    expect(getObserverRemediation(event({ trackerId: undefined, companyId: undefined, firstParty: true }))).toBeNull()
    expect(getObserverRemediation(event({ trackerId: "missing" }))).toBeNull()
  })
})