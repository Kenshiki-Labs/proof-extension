import type { ObserverEvent } from "~core/domain/types"

// canvas_read events arrive over the page channel from the MAIN world, where
// any script can post them — so like the persistence normalizer, this
// rebuilds the evidence deterministically from sanitized metadata and never
// stores page-authored prose.
//
// The status gate is the honesty-critical part: "mitigated" is a protection
// claim, and the spec's no-false-certainty rule makes forged protection
// claims the worst failure class. A page (or a stale hook) claiming
// status: "mitigated" while the user's mitigateCanvas setting is off is
// downgraded to "active" here — the background's own setting is the only
// authority on whether noise could have been applied.

const CANVAS_READ_APIS = new Set(["toDataURL", "toBlob", "getImageData"])

function sanitizedDimension(details: ObserverEvent["details"], key: string): number | null {
  const value = details?.[key]
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null
  return Math.min(Math.round(value), 1_000_000_000)
}

export function normalizeCanvasReadEvent(event: ObserverEvent, mitigationEnabled: boolean): ObserverEvent {
  if (event.eventType !== "canvas_read") return event

  const rawApi = typeof event.details?.api === "string" ? event.details.api : ""
  const api = CANVAS_READ_APIS.has(rawApi) ? rawApi : null
  const mitigated = mitigationEnabled && event.status === "mitigated"

  const base: ObserverEvent = {
    ...event,
    trackerId: undefined,
    companyId: undefined,
    firstParty: true,
    // Not labeled "fingerprinting": canvas readback is the canonical
    // fingerprinting path, but image editors and chart exports use the same
    // APIs — the display copy states the capability without the accusation.
    policyLabel: "unknown_first_party",
    blockability: "content_mitigatable",
    status: mitigated ? "mitigated" : "active",
    evidenceTier: "observed"
  }

  if (!api) {
    return {
      ...base,
      status: "active",
      confidence: "weak",
      evidence: ["A canvas read report arrived with malformed metadata and was recorded without detail."],
      details: undefined
    }
  }

  const details: Record<string, string | number> = { api }
  const sizeParts: string[] = []
  for (const key of ["width", "height", "pixels"] as const) {
    const value = sanitizedDimension(event.details, key)
    if (value !== null) {
      details[key] = value
      sizeParts.push(`${key} ${value}`)
    }
  }
  const size = sizeParts.length > 0 ? ` (${sizeParts.join(", ")})` : ""

  return {
    ...base,
    confidence: "confirmed",
    evidence: [
      mitigated
        ? `The page read canvas pixels back via ${api}${size}; the read was answered with per-session noise.`
        : `The page read canvas pixels back via ${api}${size}; the read passed through unmodified.`
    ],
    details
  }
}
