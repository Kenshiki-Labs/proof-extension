import { hostForEvent, registrableDomain } from "~core/domain/party"
import type { ObserverEvent } from "~core/domain/types"
import { getTrackerServes } from "~core/domain/valuation"
import { isDiagnosticEvent, isExposureScanEvent, isPersistenceSurfaceEvent, isUnclassifiedObservation } from "~core/state/summaries"

export function isPrivacyTradeObserver(event: ObserverEvent) {
  const category = getTrackerServes(event.trackerId)?.category
  return category === "only_their_business" || category === "advertisers_and_maybe_you"
}

export function isSourceBackedActiveObserver(event: ObserverEvent) {
  if (event.status !== "active") return false
  if (isDiagnosticEvent(event) || isExposureScanEvent(event)) return false
  if (isUnclassifiedObservation(event) || isPersistenceSurfaceEvent(event)) return false
  return Boolean(namedKey(event))
}

export function isSiteToolObserver(event: ObserverEvent) {
  if (!isSourceBackedActiveObserver(event)) return false
  const category = getTrackerServes(event.trackerId)?.category
  return category === "the_site" || category === "you_and_the_site"
}

// The source-backed name for an observer, when we have one. This is what
// gives an observer an identity in our intelligence DB; its ABSENCE is not a
// reason to stop counting the observer (that was the old attribution-as-gate
// bug), only a reason to key it by host instead.
export function namedKey(event: ObserverEvent) {
  return event.companyId ?? event.trackerId ?? null
}

// Back-compat alias: several callers still import observerCountKey.
export const observerCountKey = namedKey

// One identity per distinct third party, whether or not our DB has codified
// it. Named observers key by company/tracker id; everything else keys by the
// registrable domain of the host, so a single third party is counted once
// even when it appears across a raw request, a cache-validator header, and an
// SDK global. This is the number that should track Ghostery-style tracker
// counts: attribution NAMES a party, it never decides whether it counts.
export function partyKey(event: ObserverEvent): string | null {
  const named = namedKey(event)
  if (named) return `named:${named}`
  const host = hostForEvent(event)
  if (!host) return null
  const domain = registrableDomain(host)
  return domain ? `site:${domain}` : null
}

// A distinct third party is "watching" when it made an active, non-first-party
// contact that is real page activity (not our own diagnostics or the
// extension exposure scan). Cache-validator and unclassified-request evidence
// count here: they are proof a third party touched the page, folded into that
// party's key. First-party surfaces (the site's own storage/cache) never do.
export function isThirdPartyObserverEvent(event: ObserverEvent): boolean {
  if (event.firstParty) return false
  if (event.status !== "active") return false
  if (isDiagnosticEvent(event) || isExposureScanEvent(event)) return false
  return partyKey(event) !== null
}

function countPartiesBy(events: ObserverEvent[], predicate: (event: ObserverEvent) => boolean) {
  const keys = new Set<string>()
  for (const event of events) {
    if (!isThirdPartyObserverEvent(event) || !predicate(event)) continue
    const key = partyKey(event)
    if (key) keys.add(key)
  }
  return keys.size
}

// THE headline "watching" number: every distinct third party we observed,
// named or not. Named-only gating used to collapse ~28 observed parties to 2.
export function countThirdPartyObservers(events: ObserverEvent[]) {
  return countPartiesBy(events, () => true)
}

// Third parties we have a source-backed name for — the subset our DB codified.
export function countIdentifiedObservers(events: ObserverEvent[]) {
  return countPartiesBy(events, (event) => Boolean(namedKey(event)))
}

// Third parties observed but not yet attributed to a tracker record. Kept
// visible (not hidden) so the UI shows everything we can see even before the
// DB codifies it — the debugging requirement.
export function countUnclassifiedParties(events: ObserverEvent[]) {
  return countPartiesBy(events, (event) => !namedKey(event))
}

export function countPrivacyTradeObservers(events: ObserverEvent[]) {
  return countObserversBy(events, (event) => isSourceBackedActiveObserver(event) && isPrivacyTradeObserver(event))
}

// The headline counts all distinct third parties. Kept as the canonical name
// so every surface (popup, report, verdict, copy payload) reads one number.
export function countWatchingObservers(events: ObserverEvent[]) {
  return countThirdPartyObservers(events)
}

export function countSourceBackedActiveObservers(events: ObserverEvent[]) {
  return countObserversBy(events, isSourceBackedActiveObserver)
}

export function countSiteToolObservers(events: ObserverEvent[]) {
  return countObserversBy(events, isSiteToolObserver)
}

function countObserversBy(events: ObserverEvent[], predicate: (event: ObserverEvent) => boolean) {
  const keys = new Set<string>()
  for (const event of events) {
    if (!predicate(event)) continue
    const key = namedKey(event)
    if (key) keys.add(key)
  }
  return keys.size
}
