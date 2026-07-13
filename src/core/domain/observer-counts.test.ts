import { describe, expect, it } from "vitest"

import type { ObserverEvent } from "~core/domain/types"

import { countIdentifiedObservers, countThirdPartyObservers, countUnclassifiedParties, countWatchingObservers } from "./observer-counts"

function event(overrides: Partial<ObserverEvent>): ObserverEvent {
  return {
    id: "event",
    tabId: 1,
    origin: "https://www.cnn.com",
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

describe("countThirdPartyObservers — every distinct third party, named or not", () => {
  it("counts observed third parties even with no tracker-DB name", () => {
    const events = [
      event({ id: "a", details: { host: "beacons-wbd.mediamelon.com" } }),
      event({ id: "b", details: { host: "out053.litix.io" } })
    ]
    expect(countThirdPartyObservers(events)).toBe(2)
    expect(countIdentifiedObservers(events)).toBe(0)
    expect(countUnclassifiedParties(events)).toBe(2)
    // countWatchingObservers is the canonical headline alias.
    expect(countWatchingObservers(events)).toBe(2)
  })

  it("folds one third party into a single count across evidence families and subdomains", () => {
    // The old fragmented keying counted this as three: a request, a
    // cache-validator header, and a different subdomain. All resolve to the
    // registrable domain max.com — one party.
    const events = [
      event({ id: "req", eventType: "request_seen", details: { host: "fly.live.cnn.us.prd.media.max.com" } }),
      event({
        id: "cache",
        eventType: "cache_validator_seen",
        details: { host: "fly.live.cnn.us.prd.media.max.com", headerName: "last-modified" }
      }),
      event({ id: "other", eventType: "request_seen", details: { host: "cdn2.max.com" } })
    ]
    expect(countThirdPartyObservers(events)).toBe(1)
    expect(countUnclassifiedParties(events)).toBe(1)
  })

  it("splits named and unnamed parties but counts both as watchers", () => {
    const events = [
      event({ id: "meta", trackerId: "meta-pixel", companyId: "meta", eventType: "sdk_detected", source: "api-hook" }),
      event({ id: "meta2", trackerId: "meta-pixel", companyId: "meta" }),
      event({ id: "host", details: { host: "unknown.example" } })
    ]
    expect(countThirdPartyObservers(events)).toBe(2) // meta + unknown.example
    expect(countIdentifiedObservers(events)).toBe(1)
    expect(countUnclassifiedParties(events)).toBe(1)
  })

  it("never counts first-party surfaces, diagnostics, exposure scans, or inactive parties", () => {
    const events = [
      event({ id: "fp", firstParty: true, eventType: "cache_validator_seen", details: { host: "media.cnn.com", headerName: "etag" } }),
      event({
        id: "storage",
        firstParty: true,
        source: "api-hook",
        eventType: "storage_write",
        details: { area: "localStorage", key: "x" }
      }),
      event({ id: "scan", firstParty: true, source: "extension-scan", eventType: "browser_surface" }),
      event({ id: "diag", firstParty: true, source: "content", eventType: "extension_diagnostic" }),
      event({ id: "blocked", trackerId: "meta-pixel", companyId: "meta", status: "blocked" })
    ]
    expect(countThirdPartyObservers(events)).toBe(0)
  })
})
