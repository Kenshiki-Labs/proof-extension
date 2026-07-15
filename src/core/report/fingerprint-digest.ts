import type { ObserverEvent } from "~core/domain/types"
import { isDiagnosticEvent, isExposureScanEvent } from "~core/state/summaries"

// Plain-language digest of the FINGERPRINTING the page did itself — the
// first-party device reads that never show up in the third-party watcher
// count, and so were invisible in the audit brief until now. Capability scans
// (source "extension-scan") are excluded: those are what the page COULD read,
// reported separately as "browser checks"; this is what the page's own scripts
// actually did.
//
// Ordered most- to least- alarming so the sentence leads with the strongest
// signal. Each label is the extension's own copy, never page-supplied text.
const FINGERPRINT_LABELS: ReadonlyArray<readonly [ObserverEvent["eventType"], string]> = [
  ["webrtc_probe", "network (WebRTC/IP) addresses"],
  ["canvas_read", "canvas"],
  ["webgl_query", "graphics card"],
  ["audio_fingerprint", "audio"],
  ["font_enumeration", "installed fonts"],
  ["device_field_read", "device details (such as processor cores, memory, screen, or time zone)"]
]

function isPageFingerprintRead(event: ObserverEvent): boolean {
  if (isDiagnosticEvent(event) || isExposureScanEvent(event)) return false
  return event.status === "active" || event.status === "mitigated"
}

// Returns the ordered, distinct human labels for the fingerprint surfaces the
// page's own scripts read, or an empty array if none were observed.
export function fingerprintReadKinds(events: ObserverEvent[]): string[] {
  const present = new Set(events.filter(isPageFingerprintRead).map((event) => event.eventType))
  return FINGERPRINT_LABELS.filter(([type]) => present.has(type)).map(([, label]) => label)
}

// One plain-language takeaway sentence for the audit brief, or null when the
// page read no device surface itself. Kept honest: this is a first-party
// behavior, explicitly distinguished from third-party contact.
export function fingerprintReadTakeaway(events: ObserverEvent[]): string | null {
  const kinds = fingerprintReadKinds(events)
  if (kinds.length === 0) return null

  const list = kinds.length === 1 ? kinds[0] : `${kinds.slice(0, -1).join(", ")} and ${kinds[kinds.length - 1]}`
  return `This page read device-identifying surfaces itself — ${list} — first-party fingerprinting that is separate from any third-party contact.`
}
