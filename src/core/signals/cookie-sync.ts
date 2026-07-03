// Narrow structural view of a tracker: only what sync detection needs.
// Keeps this module decoupled from the full tracker schema (and from
// in-flight schema migrations).
export type SyncTracker = {
  id: string
  match: { domains: string[] }
}

// Cookie/ID sync detection: the mechanism by which separate tracking
// companies merge their profiles of the same person. Runs only on requests
// that already matched a known tracker (precision over recall), and only on
// deterministic URL evidence — a sync-shaped path segment, an identifier
// handoff parameter, or a redirect parameter pointing at another known
// tracker's domain. Behavioral guesses are out of scope.

export type CookieSyncDetection = {
  confidence: "confirmed" | "probable"
  evidence: string[]
  indicators: string[]
}

// Path segments used by ad-tech user-sync endpoints. Matched as full path
// segments, never substrings — "/sync" matches, "/synchronize-tabs" does not.
const SYNC_PATH_SEGMENTS = new Set([
  "getuid",
  "usersync",
  "user_sync",
  "usync",
  "cksync",
  "cookiesync",
  "cookie_sync",
  "idsync",
  "id_sync",
  "pixel_sync",
  "usermatch",
  "user_match",
  "rtset",
  "setuid",
  "sync"
])

// Query parameter names whose purpose is handing one company's user ID to
// another. Deliberately excludes generic names (id, gid, ref) that ordinary
// sites use for non-sync purposes.
const ID_HANDOFF_PARAMS = new Set([
  "partner_uid",
  "partneruid",
  "buyeruid",
  "buyer_uid",
  "google_gid",
  "google_cver",
  "puid",
  "external_user_id",
  "partner_id5_uid",
  "gdpr_uid",
  "us_privacy_uid"
])

function hostnameOf(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase()
  } catch {
    return null
  }
}

function hostnameMatchesDomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`)
}

function trackerForHostname(hostname: string, trackers: SyncTracker[], excludeTrackerId: string): SyncTracker | null {
  for (const tracker of trackers) {
    if (tracker.id === excludeTrackerId) continue
    if (tracker.match.domains.some((domain) => hostnameMatchesDomain(hostname, domain))) return tracker
  }
  return null
}

export function detectCookieSync(url: string, matchedTracker: SyncTracker, trackers: SyncTracker[]): CookieSyncDetection | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  const evidence: string[] = []
  const indicators: string[] = []
  let confidence: CookieSyncDetection["confidence"] = "probable"

  const syncSegment = parsed.pathname
    .toLowerCase()
    .split("/")
    .find((segment) => SYNC_PATH_SEGMENTS.has(segment))
  if (syncSegment) {
    indicators.push(`sync_path:${syncSegment}`)
    evidence.push(`Request path to ${parsed.hostname} contains identifier-sync segment "${syncSegment}".`)
  }

  for (const [name, value] of parsed.searchParams.entries()) {
    const lowerName = name.toLowerCase()
    if (ID_HANDOFF_PARAMS.has(lowerName)) {
      indicators.push(`handoff_param:${lowerName}`)
      evidence.push(`Query parameter "${name}" passes a user identifier between companies.`)
    }

    // A parameter whose VALUE is a URL on another known tracker's domain is
    // a redirect handoff — the strongest browser-visible sync evidence.
    const valueHost = value.startsWith("http") ? hostnameOf(value) : null
    if (valueHost) {
      const partner = trackerForHostname(valueHost, trackers, matchedTracker.id)
      if (partner) {
        confidence = "confirmed"
        indicators.push(`redirect_partner:${partner.id}`)
        evidence.push(`Query parameter "${name}" redirects to ${partner.id} domain ${valueHost} — a cross-company identifier handoff.`)
      }
    }
  }

  if (evidence.length === 0) return null

  evidence.push("ID syncing lets separate tracking companies merge their profiles of the same person.")
  return { confidence, evidence, indicators }
}
