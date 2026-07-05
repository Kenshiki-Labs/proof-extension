import { describe, expect, it } from "vitest"

import { countWatchingObservers } from "~core/domain/observer-counts"
import type { ObserverEvent } from "~core/domain/types"
import { buildWatcherGroups, buildWatcherListModel, buildWatcherRows } from "./watchers"

const ORIGIN = "https://example.test"

function event(overrides: Partial<ObserverEvent>): ObserverEvent {
  return {
    id: "event",
    tabId: 1,
    origin: ORIGIN,
    observedAt: 100,
    source: "network",
    firstParty: false,
    eventType: "request_seen",
    blockability: "network_blockable",
    status: "active",
    confidence: "confirmed",
    evidence: ["Request matched tracker domain."],
    ...overrides
  }
}

function unclassified(id: string, host: string, count?: number): ObserverEvent {
  return event({
    id,
    blockability: "observable_only",
    evidenceTier: "observed",
    ...(count ? { count } : {}),
    details: { host, requestId: id, requestType: "script", url: `https://${host}/x.js` },
    evidence: [`Third-party request observed to ${host}; no tracker record matched it.`]
  })
}

describe("buildWatcherRows", () => {
  it("puts named watchers first (worst tier first), then unclassified by volume, deduping parties across signals", () => {
    const rows = buildWatcherRows(
      [
        event({ id: "ga-1", trackerId: "google-ads", companyId: "google-ads" }),
        event({ id: "ga-2", trackerId: "google-ads", companyId: "google-ads", eventType: "sdk_detected", source: "api-hook" }),
        event({ id: "lr", trackerId: "liveramp", companyId: "liveramp" }),
        unclassified("u-1", "sb.scorecardresearch.com", 5),
        unclassified("u-2", "c.permutive.com")
      ],
      ORIGIN
    )

    // liveramp (red, no-trade) outranks google-ads (amber); unclassified after named, volume-sorted.
    expect(rows.map((row) => row.key)).toEqual([
      "named:liveramp",
      "named:google-ads",
      "site:scorecardresearch.com",
      "site:permutive.com"
    ])
    expect(rows[0]?.tier).toBe("red")
    expect(rows[1]?.categoryLabel).toBe("Advertising")
    expect(rows[2]?.category).toBe("unidentified")
    expect(rows[2]?.canBlock).toBe(false)
  })

  it("mirrors the watching filter: blocked, first-party, persistence, and diagnostic events produce no rows", () => {
    const rows = buildWatcherRows(
      [
        event({ id: "blocked", trackerId: "google-ads", companyId: "google-ads", status: "blocked" }),
        event({ id: "fp", trackerId: "google-tag-manager", companyId: "google-tag-manager", firstParty: true }),
        event({ id: "storage", firstParty: true, source: "api-hook", eventType: "storage_write", blockability: "observable_only", evidenceTier: "observed", details: { area: "localStorage", key: "x" } }),
        event({ id: "diag", firstParty: true, source: "content", eventType: "extension_diagnostic", blockability: "observable_only" })
      ],
      ORIGIN
    )
    expect(rows).toEqual([])
  })

  it("prices each named watcher honestly: revenue as extraction, cost as site fees, nothing invented", () => {
    const rows = buildWatcherRows(
      [
        event({ id: "ga", trackerId: "google-ads", companyId: "google-ads" }),
        event({ id: "fs", trackerId: "fullstory", companyId: "fullstory" }),
        unclassified("u-1", "sb.scorecardresearch.com")
      ],
      ORIGIN
    )

    expect(rows.find((row) => row.trackerId === "google-ads")?.valueLabel).toBe("$420–$500/yr to them")
    expect(rows.find((row) => row.trackerId === "fullstory")?.valueLabel).toMatch(/^site pays \$/)
    expect(rows.find((row) => row.key === "site:scorecardresearch.com")?.valueLabel).toBeNull()
  })

  it("offers blocking only where the policy does — never for high-breakage user_action_required trackers", () => {
    const rows = buildWatcherRows(
      [
        event({ id: "ga", trackerId: "google-ads", companyId: "google-ads" }),
        event({ id: "gtm", trackerId: "google-tag-manager", companyId: "google-tag-manager", blockability: "user_action_required" })
      ],
      ORIGIN
    )
    expect(rows.find((row) => row.trackerId === "google-ads")?.canBlock).toBe(true)
    expect(rows.find((row) => row.trackerId === "google-tag-manager")?.canBlock).toBe(false)
  })
})

describe("buildWatcherListModel — the popup's '+N more' congruence", () => {
  const events = [
    event({ id: "ga", trackerId: "google-ads", companyId: "google-ads" }),
    event({ id: "lr", trackerId: "liveramp", companyId: "liveramp" }),
    event({ id: "fs", trackerId: "fullstory", companyId: "fullstory" }),
    unclassified("u-1", "sb.scorecardresearch.com"),
    unclassified("u-2", "c.permutive.com"),
    unclassified("u-3", "beacons.mediamelon.com")
  ]

  it("caps rows at the limit and computes moreCount from the watching headline", () => {
    const model = buildWatcherListModel(events, ORIGIN, 4)
    expect(model.rows).toHaveLength(4)
    expect(model.totalWatching).toBe(countWatchingObservers(events))
    expect(model.moreCount).toBe(model.totalWatching - 4)
    expect(model.rows.length + model.moreCount).toBe(model.totalWatching)
  })

  it("shows zero moreCount when everything fits", () => {
    const model = buildWatcherListModel(events, ORIGIN, 10)
    expect(model.rows).toHaveLength(6)
    expect(model.moreCount).toBe(0)
  })
})

describe("buildWatcherGroups — report act 3", () => {
  it("groups by functional category, largest group first, and covers every row exactly once", () => {
    const events = [
      event({ id: "ga", trackerId: "google-ads", companyId: "google-ads" }),
      event({ id: "amz", trackerId: "amazon-ads", companyId: "amazon-ads" }),
      event({ id: "fs", trackerId: "fullstory", companyId: "fullstory" }),
      unclassified("u-1", "sb.scorecardresearch.com")
    ]

    const groups = buildWatcherGroups(events, ORIGIN)
    expect(groups.map((group) => [group.label, group.rows.length])).toEqual([
      ["Advertising", 2],
      ["Session Replay", 1],
      ["Unidentified", 1]
    ])
    const totalRows = groups.reduce((sum, group) => sum + group.rows.length, 0)
    expect(totalRows).toBe(countWatchingObservers(events))
  })
})
