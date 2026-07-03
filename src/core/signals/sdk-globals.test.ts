import { describe, expect, it } from "vitest"

import { validateTrackerDatabase } from "~core/db/validate"
import type { ObserverEvent } from "~core/domain/types"
import { enrichSdkDetection, matchSdkGlobal, SDK_GLOBAL_SIGNATURES, sdkGlobalNames } from "./sdk-globals"

const { trackers } = validateTrackerDatabase()

function sdkEvent(globalName?: string): ObserverEvent {
  return {
    id: `sdk_global:https://example.test:${globalName ?? "none"}`,
    tabId: 1,
    origin: "https://example.test",
    observedAt: 100,
    source: "api-hook",
    firstParty: true,
    policyLabel: "unknown_first_party",
    eventType: "sdk_detected",
    blockability: "network_blockable",
    status: "active",
    confidence: "weak",
    evidence: ["Vendor SDK global reported by main-world observer."],
    ...(globalName ? { details: { global: globalName } } : {})
  }
}

describe("SDK global signatures", () => {
  it("references only trackers that exist in the database", () => {
    const trackerIds = new Set(trackers.map((tracker) => tracker.id))
    for (const signature of SDK_GLOBAL_SIGNATURES) {
      expect(trackerIds, `signature ${signature.global} → ${signature.trackerId}`).toContain(signature.trackerId)
    }
  })

  it("has no duplicate global names", () => {
    expect(new Set(sdkGlobalNames()).size).toBe(SDK_GLOBAL_SIGNATURES.length)
  })

  it("matches known globals and rejects unknown ones", () => {
    expect(matchSdkGlobal("fbq")).toMatchObject({ trackerId: "meta-pixel", confidence: "confirmed" })
    expect(matchSdkGlobal("dataLayer")).toMatchObject({ trackerId: "google-tag-manager", confidence: "probable" })
    expect(matchSdkGlobal("_linkedin_partner_id")).toMatchObject({ trackerId: "linkedin-insight", confidence: "probable" })
    expect(matchSdkGlobal("myOwnGlobal")).toBeNull()
  })
})

describe("enrichSdkDetection", () => {
  it("joins a known global to its tracker with factual evidence", () => {
    const enriched = enrichSdkDetection(sdkEvent("FS"), trackers)

    expect(enriched).toMatchObject({
      trackerId: "fullstory",
      companyId: "fullstory",
      firstParty: false,
      confidence: "confirmed"
    })
    expect(enriched.policyLabel).toBeUndefined()
    expect(enriched.evidence[0]).toContain("Global variable FS characteristic of FullStory")
  })

  it("strips vendor claims from unknown or forged global names", () => {
    const enriched = enrichSdkDetection(sdkEvent("definitelyNotATracker"), trackers)

    expect(enriched.trackerId).toBeUndefined()
    expect(enriched.companyId).toBeUndefined()
    expect(enriched.confidence).toBe("weak")
    // No tracker match means no DNR rule — claiming a block is available
    // would be false certainty.
    expect(enriched.blockability).toBe("observable_only")
    expect(enriched.evidence[0]).toContain("matches no known SDK signature")
  })

  it("handles a missing details.global without inventing attribution", () => {
    const enriched = enrichSdkDetection(sdkEvent(), trackers)
    expect(enriched.trackerId).toBeUndefined()
    expect(enriched.confidence).toBe("weak")
  })

  it("leaves other event types untouched", () => {
    const other = { ...sdkEvent("fbq"), eventType: "script_injected" as const }
    expect(enrichSdkDetection(other, trackers)).toBe(other)
  })
})
