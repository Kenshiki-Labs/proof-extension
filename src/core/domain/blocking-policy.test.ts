import { describe, expect, it } from "vitest"

import { validateTrackerDatabase } from "~core/db/validate"
import { blockingGuidance, filterBlockableTrackerIds } from "./blocking-policy"

describe("blockingGuidance", () => {
  it("refuses to offer blocking for functional SDKs and says why", () => {
    for (const trackerId of ["hubspot", "intercom", "drift", "google-tag-manager"]) {
      const guidance = blockingGuidance(trackerId)
      expect(guidance.offerBlocking, trackerId).toBe(false)
      if (!guidance.offerBlocking) expect(guidance.reason).toContain("Blocking disabled")
    }
  })

  it("names the concrete breakage for HubSpot", () => {
    const guidance = blockingGuidance("hubspot")
    if (guidance.offerBlocking) throw new Error("expected refusal")
    expect(guidance.reason).toContain("hbspt.forms.create()")
    expect(guidance.reason).toContain("forms")
  })

  it("offers blocking with a warning for medium-risk trackers", () => {
    for (const trackerId of ["segment", "optimizely", "braze"]) {
      const guidance = blockingGuidance(trackerId)
      expect(guidance.offerBlocking, trackerId).toBe(true)
      if (guidance.offerBlocking) expect(guidance.warning, trackerId).toBeTruthy()
    }
  })

  it("offers blocking without warning for pure trackers", () => {
    for (const trackerId of ["meta-pixel", "fullstory", "liveramp", "criteo"]) {
      expect(blockingGuidance(trackerId)).toEqual({ offerBlocking: true, warning: null })
    }
  })

  it("refuses unknown and missing tracker ids", () => {
    expect(blockingGuidance("not-a-tracker").offerBlocking).toBe(false)
    expect(blockingGuidance(undefined).offerBlocking).toBe(false)
  })
})

describe("filterBlockableTrackerIds", () => {
  it("strips high-risk and unknown ids, keeps the rest", () => {
    expect(filterBlockableTrackerIds(["fullstory", "hubspot", "intercom", "meta-pixel", "bogus"])).toEqual([
      "fullstory",
      "meta-pixel"
    ])
  })

  it("every tracker record resolves to a decision", () => {
    for (const tracker of validateTrackerDatabase().trackers) {
      const guidance = blockingGuidance(tracker.id)
      expect(typeof guidance.offerBlocking, tracker.id).toBe("boolean")
    }
  })
})
