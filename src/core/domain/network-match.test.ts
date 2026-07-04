import { describe, expect, it } from "vitest"

import { validateTrackerDatabase } from "~core/db/validate"
import { matchTracker, matchTrackerRequest } from "./network-match"

const { trackers } = validateTrackerDatabase()

describe("matchTracker", () => {
  it("matches a known third-party tracker domain", () => {
    const match = matchTracker("https://www.google-analytics.com/g/collect?v=2", trackers)

    expect(match?.id).toBe("google-analytics")
  })

  it("matches a subdomain of a tracker domain", () => {
    const match = matchTracker("https://edge.fullstory.com/rec/page", trackers)

    expect(match?.id).toBe("fullstory")
  })

  it("does not match an unrelated domain sharing a substring", () => {
    const match = matchTracker("https://not-google-analytics.com/g/collect", trackers)

    expect(match).toBeNull()
  })

  it("returns null for a malformed URL instead of throwing", () => {
    expect(matchTracker("not a url", trackers)).toBeNull()
  })

  it("returns null when nothing matches", () => {
    const match = matchTracker("https://example.test/", trackers)

    expect(match).toBeNull()
  })

  it("returns evidence for matched tracker requests", () => {
    const [match] = matchTrackerRequest({ type: "xmlhttprequest", url: "https://www.google-analytics.com/g/collect?v=2" }, trackers)

    expect(match?.tracker.id).toBe("google-analytics")
    expect(match?.evidence).toEqual(["Request matched google-analytics domain google-analytics.com."])
  })

  it("respects tracker request types when a request type is supplied", () => {
    const matches = matchTrackerRequest({ type: "font", url: "https://www.google-analytics.com/g/collect?v=2" }, trackers)

    expect(matches).toEqual([])
  })

  // Regression: google-analytics used to also claim www.googletagmanager.com,
  // so one gtag.js load matched two records and double-counted. Domain spaces
  // are disjoint now (enforced by validate.ts) — a googletagmanager.com load
  // attributes to exactly one record.
  it("matches a googletagmanager.com script load to exactly one record", () => {
    const matches = matchTrackerRequest({ type: "script", url: "https://www.googletagmanager.com/gtag/js?id=G-XXXX" }, trackers)

    expect(matches.map((match) => match.tracker.id)).toEqual(["google-tag-manager"])
  })
})
