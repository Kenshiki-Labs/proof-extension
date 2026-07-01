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
  remediationId: "fullstory-default"
}

describe("validateTrackerDatabase", () => {
  it("validates DB schemas and cross-file references", () => {
    const db = validateTrackerDatabase()

    expect(db.trackers).toHaveLength(1)
    expect(db.trackers[0]?.companyId).toBe("fullstory")
    expect(db.companies[0]?.id).toBe("fullstory")
    expect(db.remediation[0]?.id).toBe("fullstory-default")
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
})