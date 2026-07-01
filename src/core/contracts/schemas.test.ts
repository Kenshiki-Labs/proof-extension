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
})

describe("RuntimeMessageSchema", () => {
  it("validates observed-event messages", () => {
    expect(RuntimeMessageSchema.parse({ type: "OBSERVED_EVENT", payload: observerEvent })).toMatchObject({
      type: "OBSERVED_EVENT"
    })
  })
})