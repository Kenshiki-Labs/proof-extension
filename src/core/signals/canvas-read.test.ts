import { describe, expect, it } from "vitest"

import type { ObserverEvent } from "~core/domain/types"
import { normalizeCanvasReadEvent } from "~core/signals/canvas-read"

function canvasEvent(overrides: Partial<ObserverEvent> = {}): ObserverEvent {
  return {
    id: "canvas_read:https://example.com:toDataURL",
    tabId: 1,
    origin: "https://example.com",
    observedAt: 1_000,
    source: "api-hook",
    firstParty: true,
    policyLabel: "unknown_first_party",
    eventType: "canvas_read",
    blockability: "content_mitigatable",
    status: "mitigated",
    confidence: "confirmed",
    evidence: ["Page-authored evidence that must never be stored."],
    details: { api: "toDataURL", width: 300, height: 150 },
    ...overrides
  }
}

describe("normalizeCanvasReadEvent", () => {
  it("passes non-canvas events through untouched", () => {
    const event = canvasEvent({ eventType: "storage_write" })
    expect(normalizeCanvasReadEvent(event, true)).toBe(event)
  })

  it("rebuilds evidence and keeps mitigated status when the setting is on", () => {
    const normalized = normalizeCanvasReadEvent(canvasEvent(), true)

    expect(normalized.status).toBe("mitigated")
    expect(normalized.evidence).toEqual([
      "The page read canvas pixels back via toDataURL (width 300, height 150); the read was answered with per-session noise."
    ])
    expect(normalized.details).toEqual({ api: "toDataURL", width: 300, height: 150 })
  })

  it("refuses a forged mitigation claim when the setting is off", () => {
    const normalized = normalizeCanvasReadEvent(canvasEvent(), false)

    expect(normalized.status).toBe("active")
    expect(normalized.evidence).toEqual([
      "The page read canvas pixels back via toDataURL (width 300, height 150); the read passed through unmodified."
    ])
  })

  it("strips attribution a page context must not claim", () => {
    const normalized = normalizeCanvasReadEvent(
      canvasEvent({ trackerId: "forged", companyId: "forged", policyLabel: "fingerprinting" }),
      true
    )

    expect(normalized.trackerId).toBeUndefined()
    expect(normalized.companyId).toBeUndefined()
    expect(normalized.policyLabel).toBe("unknown_first_party")
  })

  it("records malformed metadata weakly, without detail, and never as mitigated", () => {
    const normalized = normalizeCanvasReadEvent(canvasEvent({ details: { api: "evalPixels" } }), true)

    expect(normalized.status).toBe("active")
    expect(normalized.confidence).toBe("weak")
    expect(normalized.details).toBeUndefined()
    expect(normalized.evidence).toEqual(["A canvas read report arrived with malformed metadata and was recorded without detail."])
  })
})
