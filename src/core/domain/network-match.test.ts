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

  // The fullstory record lists both fullstory.com and edge.fullstory.com; a
  // request to the subdomain hits both index entries but is ONE observation.
  // The more specific domain must win the evidence string.
  it("produces one match when a record lists both a domain and its subdomain", () => {
    const matches = matchTrackerRequest({ type: "script", url: "https://edge.fullstory.com/s/fs.js" }, trackers)

    expect(matches).toHaveLength(1)
    expect(matches[0]?.evidence).toEqual(["Request matched fullstory domain edge.fullstory.com."])
  })

  it("matches case-insensitively against mixed-case hostnames", () => {
    const match = matchTracker("https://Edge.FullStory.com/s/fs.js", trackers)
    expect(match?.id).toBe("fullstory")
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
