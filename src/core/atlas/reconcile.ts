import type { Giveup, GiveupCategory } from "~core/atlas/types"
import { isThirdPartyObserverEvent, partyKey } from "~core/domain/observer-counts"
import type { ObserverEvent } from "~core/domain/types"
import { isPageActivityEvent } from "~core/state/summaries"

// Done vs. Declared reconciliation (docs/consent-atlas-tab-spec.md).
//
// The observed side (what this page DID, from the event stream) is grouped
// into extraction classes; each class carries the fixed set of clause
// categories that would authorize it. Detected clauses from the site's own
// documents are matched against those needs. Three outputs:
//   observed & declared   — done, and the contract claims the right
//   observed, undeclared  — done, and NO authorizing clause was FOUND (the
//                           disclosure gap; "found", never "exists")
//   declared, not seen    — dormant powers reserved but not exercised here
//
// This mapping is a fixed table, deliberately NOT AI and deliberately honest
// about semantic distance: canvas/font/GPU reads are DEVICE fingerprinting,
// which policies authorize under tracking-technology language — never under
// "biometric" (a policy's "fingerprint" means a finger, not a GPU).

export type ObservedClassKey = "third_party_contact" | "fingerprint_read" | "identifier_handoff" | "ip_visibility"

// "observed" = page activity did it (isPageActivityEvent). "capability" = only
// our own probe proved the surface readable (extension-scan) — the claim must
// downgrade to "readable by every script here", never "the page read it".
export type EpistemicTier = "observed" | "capability"

export type ObservedClass = {
  key: ObservedClassKey
  label: string
  tier: EpistemicTier
  // Distinct third parties involved (party-keyed — same counter family as the
  // popup/report headline; attribution names a party, never gates counting).
  parties: number
  eventCount: number
  authorizedBy: readonly GiveupCategory[]
}

export type ReconciledClass = ObservedClass & {
  status: "declared" | "undeclared"
  clauses: Giveup[]
}

export type ConsentAudit = {
  observed: ReconciledClass[]
  dormant: Giveup[]
  consentTheater: { bannerObserved: boolean; cookieClauses: Giveup[] }
  counts: { observedClasses: number; declared: number; undeclared: number; dormant: number }
}

// Clause categories that would authorize each observed extraction class.
// ip_visibility accepts sharing clauses too: "we share data with third
// parties" covers the IP reaching them — no rule matches bare "IP address"
// wording yet, and location_tracking alone would brand sites that disclosed
// the flow with a guaranteed false gap.
const AUTHORIZING: Record<ObservedClassKey, readonly GiveupCategory[]> = {
  third_party_contact: ["data_sharing_third_parties", "tracking_advertising"],
  fingerprint_read: ["tracking_advertising", "sensitive_inference", "cross_device_tracking"],
  identifier_handoff: ["data_sharing_third_parties", "cross_device_tracking", "data_broker_enrichment"],
  ip_visibility: ["location_tracking", "data_sharing_third_parties"]
}

// Cookie/banner-mechanics clauses reconcile against the consent banner, not
// against an extraction behavior — they land in the consent-theater strip.
const COOKIE_FAMILY: readonly GiveupCategory[] = [
  "legitimate_interest_tracking",
  "cookie_reject_friction",
  "multi_click_cookie_rejection",
  "non_private_defaults",
  "confusing_cookie_notice"
]

const FINGERPRINT_EVENT_TYPES = new Set<ObserverEvent["eventType"]>([
  "canvas_read",
  "audio_fingerprint",
  "webgl_query",
  "font_enumeration",
  "webrtc_probe",
  "browser_surface"
])

const HANDOFF_EVENT_TYPES = new Set<ObserverEvent["eventType"]>(["cookie_sync", "identity_digest_observed"])

// Distinct THIRD parties only — the same gate the popup/report headline uses
// (isThirdPartyObserverEvent). A first-party canvas read must never render as
// "1 party": the site itself is not a "party" in any counter we show.
function distinctParties(events: ObserverEvent[]): number {
  const keys = new Set<string>()
  for (const event of events) {
    if (!isThirdPartyObserverEvent(event)) continue
    const key = partyKey(event)
    if (key) keys.add(key)
  }
  return keys.size
}

function totalCount(events: ObserverEvent[]): number {
  return events.reduce((sum, event) => sum + (event.count ?? 1), 0)
}

// Build the observed side of the reconciliation from the event stream.
// Diagnostics never contribute; probe-only evidence yields tier "capability".
export function deriveObservedClasses(events: ObserverEvent[]): ObservedClass[] {
  const classes: ObservedClass[] = []

  // "Contacted" and "IP received" are NETWORK claims — a packet must have
  // been observed leaving. sdk_detected proves tracker software is present
  // even when its request was cached/cloaked, so it counts in the popup's
  // watching headline, but it must not support "the packet went out" here.
  const networkContact = events.filter((event) => isThirdPartyObserverEvent(event) && event.source === "network")
  if (networkContact.length > 0) {
    classes.push({
      key: "third_party_contact",
      label: "Third parties contacted from this page",
      tier: "observed",
      parties: distinctParties(networkContact),
      eventCount: totalCount(networkContact),
      authorizedBy: AUTHORIZING.third_party_contact
    })
    // Every request that left carried the IP; each contacted party received
    // it. That is observed fact, not capability — the packet went out.
    classes.push({
      key: "ip_visibility",
      label: "IP address received by every contacted party",
      tier: "observed",
      parties: distinctParties(networkContact),
      eventCount: totalCount(networkContact),
      authorizedBy: AUTHORIZING.ip_visibility
    })
  }

  const fingerprint = events.filter((event) => FINGERPRINT_EVENT_TYPES.has(event.eventType))
  const fingerprintByPage = fingerprint.filter(isPageActivityEvent)
  if (fingerprint.length > 0) {
    const observedByPage = fingerprintByPage.length > 0
    const active = observedByPage ? fingerprintByPage : fingerprint
    classes.push({
      key: "fingerprint_read",
      label: observedByPage
        ? "Device fingerprint surfaces read by page scripts"
        : "Device fingerprint surfaces readable by every script here",
      tier: observedByPage ? "observed" : "capability",
      parties: distinctParties(active),
      eventCount: totalCount(active),
      authorizedBy: AUTHORIZING.fingerprint_read
    })
  }

  const handoff = events.filter((event) => HANDOFF_EVENT_TYPES.has(event.eventType) && isPageActivityEvent(event))
  if (handoff.length > 0) {
    classes.push({
      key: "identifier_handoff",
      label: "Identifier hand-offs between companies",
      tier: "observed",
      parties: distinctParties(handoff),
      eventCount: totalCount(handoff),
      authorizedBy: AUTHORIZING.identifier_handoff
    })
  }

  return classes
}

export function hasConsentBanner(events: ObserverEvent[]): boolean {
  return events.some((event) => event.eventType === "consent_signal_observed" && isPageActivityEvent(event))
}

// Match observed classes against the clauses detected in THIS site's own
// documents. A giveup can authorize more than one class; a giveup consumed by
// the consent-theater strip is not repeated as a dormant power.
export function reconcile(events: ObserverEvent[], giveups: Giveup[]): ConsentAudit {
  const observedClasses = deriveObservedClasses(events)
  const bannerObserved = hasConsentBanner(events)

  const byCategory = new Map<GiveupCategory, Giveup[]>()
  for (const giveup of giveups) {
    const bucket = byCategory.get(giveup.category)
    if (bucket) bucket.push(giveup)
    else byCategory.set(giveup.category, [giveup])
  }

  const matchedCategories = new Set<GiveupCategory>()
  const observed: ReconciledClass[] = observedClasses.map((observedClass) => {
    const clauses = observedClass.authorizedBy.flatMap((category) => byCategory.get(category) ?? [])
    for (const clause of clauses) matchedCategories.add(clause.category)
    return { ...observedClass, status: clauses.length > 0 ? "declared" : "undeclared", clauses }
  })

  const cookieClauses = bannerObserved ? COOKIE_FAMILY.flatMap((category) => byCategory.get(category) ?? []) : []
  for (const clause of cookieClauses) matchedCategories.add(clause.category)

  const dormant = giveups.filter((giveup) => !matchedCategories.has(giveup.category)).sort((a, b) => b.scoring.score - a.scoring.score)

  return {
    observed,
    dormant,
    consentTheater: { bannerObserved, cookieClauses },
    counts: {
      observedClasses: observed.length,
      declared: observed.filter((entry) => entry.status === "declared").length,
      undeclared: observed.filter((entry) => entry.status === "undeclared").length,
      dormant: dormant.length
    }
  }
}
