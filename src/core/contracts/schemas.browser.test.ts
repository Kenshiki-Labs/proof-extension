import { describe, expect, it } from "vitest"

import { ObserverEventSchema } from "./schemas"

describe("browser-mode contract smoke test", () => {
  it("validates observer contracts in a real browser context", () => {
    const canvas = document.createElement("canvas")

    expect(canvas).toBeInstanceOf(HTMLCanvasElement)
    expect(
      ObserverEventSchema.parse({
        id: "browser-event-1",
        tabId: 1,
        origin: location.origin || "http://localhost",
        observedAt: 1,
        source: "api-hook",
        firstParty: true,
        policyLabel: "fingerprinting",
        eventType: "canvas_read",
        blockability: "content_mitigatable",
        status: "active",
        confidence: "probable",
        evidence: ["Browser-mode canvas element exists."]
      })
    ).toMatchObject({ eventType: "canvas_read" })
  })
})