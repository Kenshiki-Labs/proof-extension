import type { TrackerRecord } from "~core/contracts/schemas"

export type TrackerRequestInput = {
  url: string
  type?: string | undefined
}

export type TrackerRequestMatch = {
  tracker: TrackerRecord
  evidence: string[]
}

function hostnameMatchesDomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`)
}

// Matches on domain only, never on a bare path substring independent of
// domain: a path like "/g/collect" or "/tr" would otherwise match any
// unrelated site exposing a same-named first-party route (proven by a false
// positive against "not-google-analytics.com/g/collect"). Requiring an exact
// path from `match.paths` too would swing the other way — real vendors use
// path variants this DB doesn't enumerate (GA alone ships /collect,
// /g/collect, /j/collect, /r/collect), so it would silently miss real hits.
// A third-party tracker's ingest domain is the reliable standalone signal;
// `match.paths` remains in the schema for dnr.ts's narrower DNR rule scoping,
// not for this identification check.
function requestTypeMatches(tracker: TrackerRecord, type: string | undefined) {
  if (!type || tracker.match.requestTypes.length === 0) return true
  return tracker.match.requestTypes.includes(type)
}

export function matchTrackerRequest(input: TrackerRequestInput, trackers: TrackerRecord[]): TrackerRequestMatch[] {
  let hostname: string
  try {
    hostname = new URL(input.url).hostname
  } catch {
    return []
  }

  return trackers.flatMap((tracker) => {
    if (!requestTypeMatches(tracker, input.type)) return []
    const matchedDomain = tracker.match.domains.find((domain) => hostnameMatchesDomain(hostname, domain))
    if (!matchedDomain) return []

    return [
      {
        tracker,
        evidence: [`Request matched ${tracker.id} domain ${matchedDomain}.`]
      }
    ]
  })
}

// Pure URL-string matching against the tracker DB, independent of Chrome's
// declarative "||domain^" filter syntax used by dnr.ts. This is what lets a
// webRequest observer (which sees real request URLs, not DNR's abstracted
// rule-match callback) turn a request into an ObserverEvent.
export function matchTracker(url: string, trackers: TrackerRecord[]): TrackerRecord | null {
  return matchTrackerRequest({ url }, trackers)[0]?.tracker ?? null
}
