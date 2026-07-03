import { describe, expect, it } from "vitest"

import { ObserverEventSchema, RuntimeMessageSchema } from "./schemas"

const observerEvent = {
  id: "event-1",
  tabId: 12,
  origin: "https://example.test",
  observedAt: 1,
  source: "api-hook",
  firstParty: true,
  policyLabel: "fingerprinting",
  eventType: "canvas_read",
  blockability: "content_mitigatable",
  status: "active",
  confidence: "probable",
  evidence: ["HTMLCanvasElement.toDataURL was called by page script."]
}

describe("ObserverEventSchema", () => {
  it("accepts evidence-backed observer events", () => {
    expect(ObserverEventSchema.parse(observerEvent)).toMatchObject(observerEvent)
  })

  it("rejects events without evidence", () => {
    expect(() => ObserverEventSchema.parse({ ...observerEvent, evidence: [] })).toThrow()
  })

  it("accepts extension browser-surface exposure scan events", () => {
    expect(ObserverEventSchema.parse({
      ...observerEvent,
      id: "browser_surface:https://example.test:passive",
      source: "extension-scan",
      eventType: "browser_surface",
      blockability: "observable_only",
      confidence: "confirmed",
      evidence: ["Browser APIs exposed passive surface fields to the extension scan."]
    })).toMatchObject({
      source: "extension-scan",
      eventType: "browser_surface"
    })
  })
})

describe("RuntimeMessageSchema", () => {
  it("validates observed-event messages", () => {
    expect(RuntimeMessageSchema.parse({ type: "OBSERVED_EVENT", payload: observerEvent })).toMatchObject({
      type: "OBSERVED_EVENT"
    })
  })
})