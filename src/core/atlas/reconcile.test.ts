import { describe, expect, it } from "vitest"

import { deriveObservedClasses, hasConsentBanner, reconcile } from "~core/atlas/reconcile"
import type { Giveup } from "~core/atlas/types"
import type { ObserverEvent } from "~core/domain/types"

function event(overrides: Partial<ObserverEvent>): ObserverEvent {
  return {
    id: overrides.id ?? `evt:${Math.abs(JSON.stringify(overrides).length)}`,
    tabId: 1,
    origin: "https://example.com",
    observedAt: 1,
    source: "network",
    firstParty: false,
    eventType: "request_seen",
    blockability: "observable_only",
    status: "active",
    confidence: "confirmed",
    evidence: ["fixture"],
    ...overrides,
  }
}

function giveup(overrides: Partial<Giveup> & Pick<Giveup, "category">): Giveup {
  return {
    id: `${overrides.category}#1`,
    pattern_id: overrides.category,
    ontology_version: "consent-dark-patterns-0.1.0",
    family: "privacy",
    short_label: overrides.category,
    plain_english_summary: "fixture summary",
    why_it_matters: "fixture why",
    source_document: "privacy_policy",
    source_url: "https://example.com/privacy",
    source_quote: "fixture quote from the document",
    evidence_confidence: 0.7,
    evidence_phrases: [],
    actionability: 0.4,
    suggested_mitigation: "fixture mitigation",
    scoring: {
      rubric_version: "atlas-severity-1.0.0",
      score: 50,
      base: 50,
      boost: 0,
      per_factor: {
        surprise: 0.5,
        data_sensitivity: 0.5,
        scope_or_sharing: 0.5,
        irreversibility: 0.5,
        remedy_or_economic: 0.5,
        actionability_inverse: 0.5,
      },
    },
    ...overrides,
  } as Giveup
}

const TRACKER_EVENT = event({ id: "net:1", trackerId: "doubleclick", companyId: "google" })
const CANVAS_BY_PAGE = event({ id: "fp:1", source: "api-hook", eventType: "canvas_read", firstParty: true })
const CANVAS_BY_PROBE = event({ id: "probe:1", source: "extension-scan", eventType: "browser_surface", firstParty: true })
const COOKIE_SYNC = event({ id: "sync:1", source: "network", eventType: "cookie_sync", trackerId: "criteo" })
const BANNER = event({ id: "cmp:1", source: "content", eventType: "consent_signal_observed", firstParty: true })

describe("deriveObservedClasses", () => {
  it("derives third-party contact and IP visibility from third-party events", () => {
    const classes = deriveObservedClasses([TRACKER_EVENT])
    const keys = classes.map((c) => c.key)
    expect(keys).toContain("third_party_contact")
    expect(keys).toContain("ip_visibility")
    for (const entry of classes) expect(entry.tier).toBe("observed")
  })

  it("no third-party contact means no IP visibility claim", () => {
    const classes = deriveObservedClasses([CANVAS_BY_PAGE])
    expect(classes.map((c) => c.key)).not.toContain("ip_visibility")
  })

  it("page-sourced fingerprint reads are tier observed", () => {
    const classes = deriveObservedClasses([CANVAS_BY_PAGE])
    const fingerprint = classes.find((c) => c.key === "fingerprint_read")
    expect(fingerprint?.tier).toBe("observed")
    expect(fingerprint?.label).toContain("read by page scripts")
  })

  it("probe-only fingerprint evidence downgrades to capability — never claims the page did it", () => {
    const classes = deriveObservedClasses([CANVAS_BY_PROBE])
    const fingerprint = classes.find((c) => c.key === "fingerprint_read")
    expect(fingerprint?.tier).toBe("capability")
    expect(fingerprint?.label).toContain("readable")
    expect(fingerprint?.label).not.toContain("read by page scripts")
  })

  it("fingerprinting is device tracking, never biometric — the mapping must not contain biometric_or_sensitive", () => {
    const classes = deriveObservedClasses([CANVAS_BY_PAGE])
    const fingerprint = classes.find((c) => c.key === "fingerprint_read")
    expect(fingerprint?.authorizedBy).not.toContain("biometric_or_sensitive")
  })

  it("diagnostics never create observed classes", () => {
    const diagnostic = event({ id: "diag:1", source: "content", eventType: "extension_diagnostic", firstParty: true })
    expect(deriveObservedClasses([diagnostic])).toEqual([])
  })
})

describe("reconcile", () => {
  it("splits observed classes into declared and undeclared, and leaves the rest dormant", () => {
    const sharing = giveup({ category: "data_sharing_third_parties" })
    const arbitration = giveup({ category: "arbitration_class_action_waiver", scoring: { rubric_version: "atlas-severity-1.0.0", score: 64, base: 58, boost: 6, per_factor: { surprise: 0.7, data_sensitivity: 0.2, scope_or_sharing: 0.4, irreversibility: 0.7, remedy_or_economic: 0.95, actionability_inverse: 0.75 } } })
    const audit = reconcile([TRACKER_EVENT, CANVAS_BY_PAGE], [sharing, arbitration])

    const contact = audit.observed.find((c) => c.key === "third_party_contact")
    expect(contact?.status).toBe("declared")
    expect(contact?.clauses).toContainEqual(sharing)

    // A sharing clause covers the IP reaching third parties — no false gap
    // when the site disclosed the data flow.
    const ip = audit.observed.find((c) => c.key === "ip_visibility")
    expect(ip?.status).toBe("declared")
    expect(ip?.clauses).toContainEqual(sharing)

    // Fingerprint reads: no tracking clause detected → the disclosure gap.
    const fingerprint = audit.observed.find((c) => c.key === "fingerprint_read")
    expect(fingerprint?.status).toBe("undeclared")

    // Arbitration was declared but nothing observed exercises it → dormant.
    expect(audit.dormant).toEqual([arbitration])
    expect(audit.counts).toEqual({ observedClasses: 3, declared: 2, undeclared: 1, dormant: 1 })
  })

  it("SDK-detected software never supports a contact or IP claim — no packet was observed", () => {
    const sdkOnly = event({ id: "sdk:1", source: "content", eventType: "sdk_detected", trackerId: "fullstory" })
    const classes = deriveObservedClasses([sdkOnly])
    expect(classes.map((c) => c.key)).not.toContain("third_party_contact")
    expect(classes.map((c) => c.key)).not.toContain("ip_visibility")
  })

  it("a first-party fingerprint read never counts the site itself as a party", () => {
    const classes = deriveObservedClasses([CANVAS_BY_PAGE])
    const fingerprint = classes.find((c) => c.key === "fingerprint_read")
    expect(fingerprint?.parties).toBe(0)
  })

  it("a tracking clause authorizes both third-party contact and fingerprint reads", () => {
    const tracking = giveup({ category: "tracking_advertising" })
    const audit = reconcile([TRACKER_EVENT, CANVAS_BY_PAGE], [tracking])
    expect(audit.observed.find((c) => c.key === "third_party_contact")?.status).toBe("declared")
    expect(audit.observed.find((c) => c.key === "fingerprint_read")?.status).toBe("declared")
    expect(audit.dormant).toEqual([])
  })

  it("identifier hand-offs reconcile against sharing, cross-device, and broker-enrichment clauses", () => {
    const crossDevice = giveup({ category: "cross_device_tracking" })
    const audit = reconcile([COOKIE_SYNC], [crossDevice])
    const handoff = audit.observed.find((c) => c.key === "identifier_handoff")
    expect(handoff?.status).toBe("declared")
    expect(handoff?.clauses).toContainEqual(crossDevice)
  })

  it("cookie-family clauses land in the consent-theater strip when a banner was observed, not in dormant", () => {
    const friction = giveup({ category: "cookie_reject_friction" })
    const audit = reconcile([BANNER, TRACKER_EVENT], [friction])
    expect(audit.consentTheater.bannerObserved).toBe(true)
    expect(audit.consentTheater.cookieClauses).toContainEqual(friction)
    expect(audit.dormant).not.toContainEqual(friction)
  })

  it("without a banner, cookie-family clauses stay dormant powers", () => {
    const friction = giveup({ category: "cookie_reject_friction" })
    const audit = reconcile([TRACKER_EVENT], [friction])
    expect(audit.consentTheater.bannerObserved).toBe(false)
    expect(audit.consentTheater.cookieClauses).toEqual([])
    expect(audit.dormant).toContainEqual(friction)
  })

  it("dormant powers sort by deterministic score, highest first", () => {
    const retention = giveup({ category: "data_retention", scoring: { rubric_version: "atlas-severity-1.0.0", score: 40, base: 40, boost: 0, per_factor: { surprise: 0.4, data_sensitivity: 0.5, scope_or_sharing: 0.4, irreversibility: 0.8, remedy_or_economic: 0.3, actionability_inverse: 0.55 } } })
    const arbitration = giveup({ category: "arbitration_class_action_waiver", scoring: { rubric_version: "atlas-severity-1.0.0", score: 64, base: 58, boost: 6, per_factor: { surprise: 0.7, data_sensitivity: 0.2, scope_or_sharing: 0.4, irreversibility: 0.7, remedy_or_economic: 0.95, actionability_inverse: 0.75 } } })
    const audit = reconcile([], [retention, arbitration])
    expect(audit.dormant.map((g) => g.category)).toEqual(["arbitration_class_action_waiver", "data_retention"])
  })

  it("empty everything reconciles to an empty audit", () => {
    const audit = reconcile([], [])
    expect(audit.observed).toEqual([])
    expect(audit.dormant).toEqual([])
    expect(audit.counts).toEqual({ observedClasses: 0, declared: 0, undeclared: 0, dormant: 0 })
  })
})

describe("hasConsentBanner", () => {
  it("detects page-sourced consent signals only", () => {
    expect(hasConsentBanner([BANNER])).toBe(true)
    const probeBanner = event({ id: "cmp:2", source: "extension-scan", eventType: "consent_signal_observed" })
    expect(hasConsentBanner([probeBanner])).toBe(false)
  })
})
