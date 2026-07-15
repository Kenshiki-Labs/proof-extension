import type { ObserverEvent } from "~core/domain/types"

// device_field_read events arrive over the page channel from the MAIN world,
// where any script can post them — so like the other api-hook normalizers,
// this rebuilds evidence deterministically from a sanitized field name and
// never stores page-authored prose. The field name is the only detail; the
// hook never captures the value, and this normalizer would drop it anyway.
//
// This is observable_only: reading a device field is a passive property access
// with no request to block and no result to mitigate without breaking the page
// or lying about the value. Naming the read is the honest, useful move.

// Maps the raw field name to the plain-language phrase used in the rebuilt
// evidence. Anything not on this list is recorded generically rather than
// echoed back, so a page cannot inject its own field label into the report.
const FIELD_PHRASES: Record<string, string> = {
  hardwareConcurrency: "how many processor cores your device has",
  deviceMemory: "roughly how much memory your device has",
  languages: "your full list of preferred languages",
  width: "your screen width",
  height: "your screen height",
  colorDepth: "your screen color depth",
  timeZone: "your time zone"
}

export function normalizeDeviceFieldReadEvent(event: ObserverEvent): ObserverEvent {
  if (event.eventType !== "device_field_read") return event

  const rawField = typeof event.details?.field === "string" ? event.details.field : ""
  const field = Object.prototype.hasOwnProperty.call(FIELD_PHRASES, rawField) ? rawField : null

  const base: ObserverEvent = {
    ...event,
    trackerId: undefined,
    companyId: undefined,
    firstParty: true,
    policyLabel: "unknown_first_party",
    blockability: "observable_only",
    status: "active",
    evidenceTier: "observed"
  }

  if (!field) {
    return {
      ...base,
      confidence: "weak",
      evidence: ["The page read a device characteristic that helps identify your device. The value was not recorded."],
      details: undefined
    }
  }

  return {
    ...base,
    confidence: "confirmed",
    evidence: [`The page read ${FIELD_PHRASES[field]} — a detail that helps identify your device. The value was not recorded.`],
    details: { field }
  }
}
