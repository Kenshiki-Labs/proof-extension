import type { TrackerRecord } from "~core/contracts/schemas"

export type TrackerRequestInput = {
  url: string
  type?: string | undefined
}

export type TrackerRequestMatch = {
  tracker: TrackerRecord
  evidence: string[]
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

type DomainIndexEntry = { tracker: TrackerRecord; domain: string }

// The spec requires common-path host lookup to be effectively constant-time
// through in-memory maps: this runs on every request the browser makes, and
// the DB is meant to grow far past its seed size (EasyPrivacy-scale imports).
// Instead of scanning every tracker per request, index registered domains
// once and probe the hostname's suffixes — "a.b.example.com" checks
// "a.b.example.com", "b.example.com", "example.com", "com": O(labels), not
// O(trackers × domains). Keyed by the trackers array identity so tests (and
// a future hot-swapped DB) get their own index without a manual cache bust.
const domainIndexCache = new WeakMap<TrackerRecord[], Map<string, DomainIndexEntry[]>>()

function domainIndexFor(trackers: TrackerRecord[]): Map<string, DomainIndexEntry[]> {
  const cached = domainIndexCache.get(trackers)
  if (cached) return cached

  const index = new Map<string, DomainIndexEntry[]>()
  for (const tracker of trackers) {
    for (const domain of tracker.match.domains) {
      const normalized = domain.toLowerCase()
      const entries = index.get(normalized) ?? []
      entries.push({ tracker, domain })
      index.set(normalized, entries)
    }
  }
  domainIndexCache.set(trackers, index)
  return index
}

function* hostnameSuffixes(hostname: string) {
  let suffix = hostname
  while (suffix.length > 0) {
    yield suffix
    const dot = suffix.indexOf(".")
    if (dot === -1) return
    suffix = suffix.slice(dot + 1)
  }
}

export function matchTrackerRequest(input: TrackerRequestInput, trackers: TrackerRecord[]): TrackerRequestMatch[] {
  let hostname: string
  try {
    hostname = new URL(input.url).hostname.toLowerCase()
  } catch {
    return []
  }

  const index = domainIndexFor(trackers)
  const matches: TrackerRequestMatch[] = []
  // A record may list both a domain and its subdomain (fullstory.com and
  // edge.fullstory.com) — both suffixes hit the index for one request, but
  // one request is one observation. Keep the first (most specific) hit per
  // tracker; suffix iteration goes longest-first, so specificity wins.
  const matchedTrackerIds = new Set<string>()
  for (const suffix of hostnameSuffixes(hostname)) {
    for (const entry of index.get(suffix) ?? []) {
      if (matchedTrackerIds.has(entry.tracker.id)) continue
      if (!requestTypeMatches(entry.tracker, input.type)) continue
      matchedTrackerIds.add(entry.tracker.id)
      matches.push({
        tracker: entry.tracker,
        evidence: [`Request matched ${entry.tracker.id} domain ${entry.domain}.`]
      })
    }
  }
  return matches
}

// Pure URL-string matching against the tracker DB, independent of Chrome's
// declarative "||domain^" filter syntax used by dnr.ts. This is what lets a
// webRequest observer (which sees real request URLs, not DNR's abstracted
// rule-match callback) turn a request into an ObserverEvent.
export function matchTracker(url: string, trackers: TrackerRecord[]): TrackerRecord | null {
  return matchTrackerRequest({ url }, trackers)[0]?.tracker ?? null
}
