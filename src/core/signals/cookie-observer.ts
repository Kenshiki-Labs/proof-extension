import { isSameSite } from "~core/domain/party"
import type { ObserverEvent } from "~core/domain/types"
import { redactIdentifier } from "~core/signals/persistence"

// Browser-level cookie observation (via the optional `cookies` permission),
// as opposed to the JS-hook path in persistence.ts that only ever sees
// document.cookie writes — and therefore can never see an HttpOnly cookie:
// if page JavaScript could read it, it would not be HttpOnly. This module
// is the privileged counterpart, called only from the background service
// worker with data straight from the browser's cookie store. Unlike
// persistence.ts's sanitizers, it never has to defend against a hostile
// page forging the input — there is no page input here at all. `value` is
// deliberately absent from ObservedCookieMetadata below: the whole point of
// this module is that a cookie's value can never reach an ObserverEvent,
// and the simplest way to guarantee that is to never accept it as a
// parameter in the first place.
export type ObservedCookieMetadata = {
  name: string
  domain: string
  secure: boolean
  httpOnly: boolean
  session: boolean
  sameSite: string
}

// A cookie's `domain` field is either an exact host (a host-only cookie,
// e.g. "shop.example.com") or a leading-dot form (e.g. ".example.com",
// meaning "this domain and every subdomain") — strip the dot before
// comparing registrable domains, so a cookie set for ".example.com" still
// matches a tab open on "shop.example.com".
export function cookieMatchesOrigin(cookieDomain: string, origin: string): boolean {
  const bareDomain = cookieDomain.replace(/^\./, "")
  if (bareDomain.length === 0) return false

  try {
    return isSameSite(bareDomain, new URL(origin).hostname)
  } catch {
    return false
  }
}

function cookieEvidence(redactedName: string, cookie: ObservedCookieMetadata): string[] {
  const mechanism = cookie.httpOnly
    ? `The server set cookie "${redactedName}" with HttpOnly, so page JavaScript cannot read it.`
    : `The browser reported cookie "${redactedName}", which page JavaScript can also read.`

  return [mechanism, "Cookie values are never recorded — only the name and attributes."]
}

// Builds an already-final, privileged ObserverEvent directly — this must
// never be routed through normalizePersistenceEvent or the OBSERVED_EVENT
// message channel, both of which exist to defend against untrusted page
// input. Reuses the cookie_observed event type from the JS-hook path (see
// persistence.ts) since both describe the same fact, "a cookie was
// observed", just through different mechanisms with different blind spots.
//
// Deliberately scoped to first-party cookies only: this extension's summary
// model is per-tab, and cookies.onChanged carries no tabId — the only
// attribution this module can stand behind is "this cookie's registrable
// domain matches a tab you have open on that same site." Attributing a
// third-party cookie (set via an embedded iframe or subresource) to
// whichever tab happens to be open would be a guess wearing evidence's
// clothes, and the spec bans exactly that. Returns null when the cookie's
// domain does not match the given tab's origin, so callers can call this
// unconditionally for every open tab without duplicating the match check.
export function buildCookieObservedEvent({
  cookie,
  tabId,
  origin,
  observedAt
}: {
  cookie: ObservedCookieMetadata
  tabId: number
  origin: string
  observedAt: number
}): ObserverEvent | null {
  if (!cookieMatchesOrigin(cookie.domain, origin)) return null

  const redactedName = redactIdentifier(cookie.name)

  return {
    id: `cookie_observed:${tabId}:${cookie.domain}:${redactedName}`,
    tabId,
    origin,
    observedAt,
    source: "api-hook",
    firstParty: true,
    policyLabel: "unknown_first_party",
    eventType: "cookie_observed",
    blockability: "observable_only",
    status: "active",
    confidence: "confirmed",
    evidenceTier: "observed",
    evidence: cookieEvidence(redactedName, cookie),
    details: {
      name: redactedName,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      session: cookie.session,
      sameSite: cookie.sameSite
    }
  }
}
