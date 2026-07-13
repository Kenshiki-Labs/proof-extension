import type { ObserverEvent, PageError, SiteSummary } from "~core/domain/types"
import {
  isDiagnosticEvent,
  isExposureScanEvent,
  isLocalPageSignalEvent,
  isPageActivityEvent,
  isPersistenceSurfaceEvent,
  isUnclassifiedObservation
} from "~core/state/summaries"

// The correctness-load-bearing keying logic: how raw recorded events merge
// into the observation rows every surface displays. A bug here miscounts —
// distinct cookies collapse into one row, or one observer renders as many.

export type DisplayObservation = {
  event: ObserverEvent
  count: number
}

export type DisplayPageError = {
  pageError: PageError
  count: number
}

export function pageActivityEvents(events: ObserverEvent[]) {
  return events.filter(isPageActivityEvent)
}

export function exposureScanEvents(events: ObserverEvent[]) {
  return events.filter(isExposureScanEvent)
}

export function diagnosticEvents(events: ObserverEvent[]) {
  return events.filter(isDiagnosticEvent)
}

export function persistenceSurfaceObservations(events: ObserverEvent[]) {
  return compactEvents(events).filter(({ event }) => isPersistenceSurfaceEvent(event))
}

export function localPageSignalObservations(events: ObserverEvent[]) {
  return compactEvents(events).filter(({ event }) => isLocalPageSignalEvent(event))
}

export function visibleSignals(summary: SiteSummary) {
  return summary.exposedSignals.filter((signal) => signal !== "extension_diagnostic")
}

export function unclassifiedObservations(events: ObserverEvent[]) {
  return compactEvents(events).filter(({ event }) => isUnclassifiedObservation(event))
}

// Host names render only for events born in the background network
// observer — a page-channel event can never smuggle an arbitrary string
// into the observer list through details.host.
function unclassifiedHost(event: ObserverEvent) {
  if (!isUnclassifiedObservation(event) || event.source !== "network") return null
  return typeof event.details?.host === "string" ? event.details.host : null
}

export function observerName(event: ObserverEvent) {
  const host = unclassifiedHost(event)
  if (host) return host
  return event.companyId ?? event.trackerId ?? (event.firstParty ? "First-party script" : "Unknown observer")
}

export function displayEventKey(event: ObserverEvent) {
  // Keyed for every source, not just extension scans: page-hook cookie
  // writes carry details.name too, and without it every distinctly named
  // cookie a page sets collapsed into one merged observation row.
  const cookieMetadataKey =
    event.eventType === "cookie_observed"
      ? [
          event.details?.name ?? "",
          event.details?.domain ?? "",
          event.details?.httpOnly ?? "",
          event.details?.secure ?? "",
          event.details?.sameSite ?? ""
        ].join(":")
      : ""
  const storageMetadataKey =
    event.eventType === "storage_write" ? [event.details?.area ?? "", event.details?.op ?? "", event.details?.key ?? ""].join(":") : ""

  return [
    event.companyId ?? "",
    event.trackerId ?? "",
    unclassifiedHost(event) ?? "",
    event.firstParty ? event.origin : "",
    event.eventType,
    event.source,
    event.status,
    event.blockability,
    typeof event.details?.apiGroup === "string" ? event.details.apiGroup : "",
    cookieMetadataKey,
    storageMetadataKey
  ].join("|")
}

export function compactEvents(events: ObserverEvent[]): DisplayObservation[] {
  const observations = new Map<string, DisplayObservation>()

  for (const event of events) {
    if (isDiagnosticEvent(event)) continue

    const key = displayEventKey(event)
    const existing = observations.get(key)
    const occurrences = event.count ?? 1
    if (!existing) {
      observations.set(key, { event, count: occurrences })
      continue
    }

    observations.set(key, {
      event: event.observedAt >= existing.event.observedAt ? event : existing.event,
      count: existing.count + occurrences
    })
  }

  return [...observations.values()].sort((left, right) => right.event.observedAt - left.event.observedAt)
}

function pageErrorKey(pageError: PageError) {
  return [pageError.message, pageError.stackPreview ?? ""].join("|")
}

export function compactPageErrors(pageErrors: PageError[]): DisplayPageError[] {
  const grouped = new Map<string, DisplayPageError>()

  for (const pageError of pageErrors) {
    const key = pageErrorKey(pageError)
    const existing = grouped.get(key)
    if (!existing) {
      grouped.set(key, { pageError, count: 1 })
      continue
    }

    grouped.set(key, {
      pageError: pageError.observedAt >= existing.pageError.observedAt ? pageError : existing.pageError,
      count: existing.count + 1
    })
  }

  return [...grouped.values()].sort((left, right) => right.pageError.observedAt - left.pageError.observedAt)
}
