import type { ObserverEvent } from "~core/domain/types"

// Why: network-family evidence is born inside the background service worker
// (webRequest observer, DNR block outcomes) and never legitimately arrives
// through the page's message channel. Without this gate, a hostile page
// could relay a forged "request_seen" for an unmatched host — or worse, a
// forged "blocked" status that claims protection the extension never
// provided. The spec's no-false-certainty rule makes forged protection
// claims the worst failure class, so network-born types are reserved here.
const NETWORK_RESERVED_EVENT_TYPES = new Set<ObserverEvent["eventType"]>([
  "request_seen",
  "request_blocked",
  "cookie_sync",
  // Born in the background webRequest header observers — no content script
  // legitimately emits it, so any page-channel arrival is a forgery.
  "cache_validator_seen"
])

// "mitigated" is a protection claim exactly like "blocked", so it is reserved
// the same way — EXCEPT for event types whose background normalizer
// re-derives the status from trusted worker state. canvas-read.ts only marks
// a read "mitigated" when settings.mitigateCanvas is genuinely on, so a
// forged canvas_read claim is neutralized downstream. Any other event type
// arriving "mitigated" through the page channel is forging protection that
// no code performed, and is rejected here before it can reach the store.
const MITIGATION_REDERIVED_EVENT_TYPES = new Set<ObserverEvent["eventType"]>(["canvas_read"])

export function untrustedObservedEventReason(event: ObserverEvent): string | null {
  if (event.source === "network") return "network_source_reserved"
  if (NETWORK_RESERVED_EVENT_TYPES.has(event.eventType)) return "network_event_type_reserved"
  if (event.status === "blocked") return "blocked_status_reserved"
  if (event.status === "mitigated" && !MITIGATION_REDERIVED_EVENT_TYPES.has(event.eventType)) {
    return "mitigated_status_reserved"
  }
  return null
}

// Attribution — which named tracker/company an observation belongs to — is
// ALWAYS derived in the background: from the tracker DB via
// enrichScriptInjection / enrichSdkDetection, or born already-attributed in
// the network observer. It never legitimately arrives through the page
// channel, where a hostile page could set trackerId/companyId on a forged
// event and make the report name a company that was never present. Stripping
// both here means downstream enrichers re-derive them from trusted evidence
// (enrichScriptInjection keys off an absent trackerId) while event types with
// no enricher stay honestly unattributed — and a future page-channel event
// type is safe by default, not one forgotten guard away from forgeable.
export function stripPageSuppliedAttribution(event: ObserverEvent): ObserverEvent {
  if (event.trackerId === undefined && event.companyId === undefined) return event
  return { ...event, trackerId: undefined, companyId: undefined }
}
