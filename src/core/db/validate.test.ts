import { describe, expect, it } from "vitest"

import { validateTrackerDatabase, validateTrackerDatabaseRecords } from "./validate"

const company = {
  id: "fullstory",
  name: "FullStory",
  parentCompany: "FullStory",
  aliases: ["FullStory"],
  categoryLabels: ["session replay"]
}

const remediation = {
  id: "fullstory-default",
  future_collection_url: "https://www.fullstory.com/legal/privacy/",
  deletion_url: "https://www.fullstory.com/legal/privacy/",
  identity_verification_required: true,
  estimated_time_minutes: 20,
  recheck_interval_days: 180,
  friction_class: "medium",
  notes: "FullStory remediation depends on the site using FullStory.",
  jurisdiction_notes: "Rights vary by jurisdiction.",
  last_verified_at: "2026-07-01"
}

const tracker = {
  id: "fullstory",
  schemaVersion: 1,
  match: {
    domains: ["fullstory.com"],
    paths: ["/s/fs.js"],
    requestTypes: ["script"]
  },
  companyId: "fullstory",
  category: "session-replay",
  collects: ["scrolls"],
  monetization: ["UX analytics"],
  browserAction: {
    blockability: "network_blockable",
    method: "network-block"
  },
  confidence: "confirmed",
  evidenceTemplate: ["Request matched FullStory domain."],
  remediationId: "fullstory-default",
  sources: [
    {
      family: "manual_seed",
      name: "Proof Extension seed tracker database",
      version: "0.0.1",
      retrieved_at: "2026-07-02",
      license: "MIT",
      transform_notes: "Hand-authored seed record for validator tests."
    }
  ],
  review: {
    status: "seed",
    last_reviewed_at: "2026-07-02",
    reviewer: "Kenshiki",
    notes: "Seed record pending source-backed import review."
  }
}

describe("validateTrackerDatabase", () => {
  it("validates DB schemas and cross-file references", () => {
    const db = validateTrackerDatabase()

    // The spec requires seeding at least 25 high-value trackers/vendors.
    expect(db.trackers.length).toBeGreaterThanOrEqual(25)

    const fullstoryTracker = db.trackers.find((item) => item.id === "fullstory")
    expect(fullstoryTracker?.companyId).toBe("fullstory")
    expect(db.companies.some((company) => company.id === "fullstory")).toBe(true)
    expect(db.remediation.some((record) => record.id === "fullstory-default")).toBe(true)
  })

  it("rejects duplicate ids", () => {
    expect(() => validateTrackerDatabaseRecords([tracker, tracker], [company], [remediation])).toThrow(
      "Duplicate tracker id"
    )
  })

  it("rejects unknown company references", () => {
    expect(() => validateTrackerDatabaseRecords([{ ...tracker, companyId: "missing" }], [company], [remediation])).toThrow(
      "unknown company"
    )
  })

  it("rejects unknown remediation references", () => {
    expect(() =>
      validateTrackerDatabaseRecords([{ ...tracker, remediationId: "missing" }], [company], [remediation])
    ).toThrow("unknown remediation")
  })

  it("rejects trackers without provenance", () => {
    const { sources, ...trackerWithoutSources } = tracker

    expect(() => validateTrackerDatabaseRecords([trackerWithoutSources], [company], [remediation])).toThrow()
    expect(sources).toHaveLength(1)
  })

  it("rejects network-blockable trackers without a blocking-policy source", () => {
    expect(() => validateTrackerDatabaseRecords([
      {
        ...tracker,
        sources: [{ ...tracker.sources[0], family: "duckduckgo_tracker_radar", url: "https://example.com/radar" }]
      }
    ], [company], [remediation])).toThrow("network_blockable without a blocking-policy source")
  })

  it("rejects source-backed review when only manual seed provenance exists", () => {
    expect(() => validateTrackerDatabaseRecords([
      {
        ...tracker,
        review: { ...tracker.review, status: "source_backed" }
      }
    ], [company], [remediation])).toThrow("cannot be source_backed")
  })

  it("rejects imported source families without required source URLs", () => {
    expect(() => validateTrackerDatabaseRecords([
      {
        ...tracker,
        browserAction: { ...tracker.browserAction, blockability: "observable_only" },
        sources: [{ ...tracker.sources[0], family: "duckduckgo_tracker_radar" }]
      }
    ], [company], [remediation])).toThrow("requires url")
  })

  it("rejects path-only tracker rules", () => {
    expect(() => validateTrackerDatabaseRecords([
      { ...tracker, match: { domains: [], paths: ["/collect"], requestTypes: ["script"] } }
    ], [company], [remediation])).toThrow("path rules without domains")
  })

  it("rejects malformed tracker domains", () => {
    expect(() => validateTrackerDatabaseRecords([
      { ...tracker, match: { ...tracker.match, domains: ["https://fullstory.com"] } }
    ], [company], [remediation])).toThrow("malformed domain")
  })

  it("rejects tracker paths without a leading slash", () => {
    expect(() => validateTrackerDatabaseRecords([
      { ...tracker, match: { ...tracker.match, paths: ["collect"] } }
    ], [company], [remediation])).toThrow("path must start with /")
  })
})