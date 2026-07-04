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
    method: "network-block",
    siteBreakage: { risk: "low", affects: [], note: "No visible site functionality is known to depend on this tracker; blocking is expected to affect tracking only." }
  },
  supplyChainRole: "site_tooling",
  whoItServes: { category: "the_site", note: "Replays visits so the site can fix problems. You benefit indirectly, if the site improves." },
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
  },
  perPersonValue: {
    schemaVersion: 1,
    currency: "USD",
    geography: "US",
    userProfile: "average_adult_internet_user",
    valueType: "cost",
    monetizationFlow: "operator_saas",
    perVisit: {
      microdollars: 40,
      dollars: 0.00004,
      basis: "operator SaaS pricing divided by tracked users"
    },
    annual: {
      low_usd: 0.5,
      high_usd: 5,
      midpoint_usd: 2.75
    },
    valueNote: "Enterprise session replay cost paid by the site.",
    sourceNote: "Vendor pricing tiers",
    sourceFindingIds: ["fullstory-valuation-2026"],
    lastUpdated: "2026-07-03",
    confidence: "estimated"
  }
}

const highFidelityFields = {
  displayName: "FullStory",
  observes: {
    browserVisible: ["script request URL"],
    siteProvided: ["session interaction events when configured by the site"],
    notVisibleToExtension: ["records already received before blocking was enabled"]
  },
  userImpact: {
    plainSummary: "FullStory records product analytics and session replay events when installed by a site.",
    whyItMatters: ["Session replay tooling can capture detailed interaction patterns."],
    riskLevel: "high",
    riskReasons: ["session replay"]
  },
  browserAction: {
    blockability: "network_blockable",
    method: "network-block",
    siteBreakage: { risk: "low", affects: [], note: "No visible site functionality is known to depend on this tracker; blocking is expected to affect tracking only." },
    whatBlockingChanges: ["Blocks future browser requests matching FullStory domains."],
    whatBlockingDoesNotChange: ["Does not delete prior records held by FullStory or the site."]
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

  it("rejects source-backed review without tracker-claim provenance", () => {
    expect(() => validateTrackerDatabaseRecords([
      {
        ...tracker,
        review: { ...tracker.review, status: "source_backed" }
      }
    ], [company], [remediation])).toThrow("without tracker-claim provenance")

    expect(() => validateTrackerDatabaseRecords([
      {
        ...tracker,
        sources: [...tracker.sources, { family: "market_research", name: "Market research", license: "Kenshiki", transform_notes: "Valuation only." }],
        review: { ...tracker.review, status: "source_backed" }
      }
    ], [company], [remediation])).toThrow("without tracker-claim provenance")
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

  it("allows v1 seed records to migrate gradually while enforcing high-fidelity fields on v2 records", () => {
    expect(() => validateTrackerDatabaseRecords([tracker], [company], [remediation])).not.toThrow()
    expect(() => validateTrackerDatabaseRecords([{ ...tracker, schemaVersion: 2 }], [company], [remediation])).toThrow(
      "v2 requires displayName"
    )
    expect(() => validateTrackerDatabaseRecords([{ ...tracker, schemaVersion: 2, ...highFidelityFields }], [company], [remediation])).not.toThrow()
  })

  it("rejects inconsistent valuation math and mislabeled sourced valuation notes", () => {
    expect(() => validateTrackerDatabaseRecords([
      { ...tracker, perPersonValue: { ...tracker.perPersonValue, perVisit: { ...tracker.perPersonValue.perVisit, dollars: 1 } } }
    ], [company], [remediation])).toThrow("inconsistent per-visit valuation math")

    expect(() => validateTrackerDatabaseRecords([
      { ...tracker, perPersonValue: { ...tracker.perPersonValue, annual: { low_usd: 5, high_usd: 1, midpoint_usd: 3 } } }
    ], [company], [remediation])).toThrow("inconsistent annual valuation range")

    expect(() => validateTrackerDatabaseRecords([
      { ...tracker, perPersonValue: { ...tracker.perPersonValue, confidence: "sourced", sourceNote: "Vendor pricing tiers" } }
    ], [company], [remediation])).toThrow("generic sourceNote")
  })

  it("rejects network blocking language that omits deletion limits", () => {
    expect(() => validateTrackerDatabaseRecords([
      {
        ...tracker,
        schemaVersion: 2,
        ...highFidelityFields,
        browserAction: {
          ...highFidelityFields.browserAction,
          whatBlockingDoesNotChange: ["Server-side events may still happen."]
        }
      }
    ], [company], [remediation])).toThrow("blocking does not delete prior records")
  })

  it("rejects high-breakage trackers classified as network_blockable", () => {
    // The blocking-policy gate never offers blocking for high-breakage
    // trackers, so a network_blockable class on one claims a capability the
    // product never exercises.
    expect(() => validateTrackerDatabaseRecords([
      {
        ...tracker,
        browserAction: {
          ...tracker.browserAction,
          siteBreakage: { risk: "high", affects: ["support chat"], note: "Blocking removes the site's chat widget." }
        }
      }
    ], [company], [remediation])).toThrow("high-breakage (never offered blocking) but classified network_blockable")

    expect(() => validateTrackerDatabaseRecords([
      {
        ...tracker,
        browserAction: {
          ...tracker.browserAction,
          blockability: "user_action_required",
          method: "source-remediation",
          siteBreakage: { risk: "high", affects: ["support chat"], note: "Blocking removes the site's chat widget." }
        }
      }
    ], [company], [remediation])).not.toThrow()
  })

  it("rejects overlapping domain spaces across tracker records", () => {
    const otherRemediation = { ...remediation, id: "acme-default" }
    const otherCompany = { ...company, id: "acme", name: "Acme" }
    const overlapping = {
      ...tracker,
      id: "acme-analytics",
      companyId: "acme",
      remediationId: "acme-default",
      match: { ...tracker.match, domains: ["edge.fullstory.com"] }
    }

    expect(() =>
      validateTrackerDatabaseRecords([tracker, overlapping], [company, otherCompany], [remediation, otherRemediation])
    ).toThrow("overlaps tracker")
  })

  it("rejects reassurance language in tracker explanations and blocking copy", () => {
    expect(() => validateTrackerDatabaseRecords([
      {
        ...tracker,
        schemaVersion: 2,
        ...highFidelityFields,
        userImpact: {
          ...highFidelityFields.userImpact,
          whyItMatters: ["Blocking makes this tracker safe."]
        }
      }
    ], [company], [remediation])).toThrow("forbidden reassurance language")
  })
})