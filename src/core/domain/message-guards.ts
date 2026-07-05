import type { ObserverEvent } from "~core/domain/types"

// Why: network-family evidence is born inside the background service worker
// (webRequest observer, DNR block outcomes) and never legitimately arrives
// through the page's message channel. Without this gate, a hostile page
// could relay a forged "request_seen" for an unmatched host — or worse, a
// forged "blocked" status that claims protection the extension never
// provided. The spec's no-false-certainty rule makes forged protection
// claims the worst failure class, so "blocked" is background-reserved even
// though "mitigated" stays open for future Phase 2 content hooks.
const NETWORK_RESERVED_EVENT_TYPES = new Set<ObserverEvent["eventType"]>([
  "request_seen",
  "request_blocked",
  "cookie_sync",
  // Born in the background webRequest header observers — no content script
  // legitimately emits it, so any page-channel arrival is a forgery.
  "cache_validator_seen"
])

export function untrustedObservedEventReason(event: ObserverEvent): string | null {
  if (event.source === "network") return "network_source_reserved"
  if (NETWORK_RESERVED_EVENT_TYPES.has(event.eventType)) return "network_event_type_reserved"
  if (event.status === "blocked") return "blocked_status_reserved"
  return null
}
