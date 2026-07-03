import { SiteSummarySchema } from "~core/contracts/schemas"
import { getObserverRemediation } from "~core/domain/remediation"
import { rollupObservedValuations } from "~core/domain/valuation"
import { isDiagnosticEvent, isExposureScanEvent, isPageActivityEvent } from "~core/state/summaries"
import type { BlockabilityClass, ObservationStatus, ObserverEvent, PageError, SiteSummary } from "~core/domain/types"

export type DisplayObservation = {
  event: ObserverEvent
  count: number
}

export type DisplayPageError = {
  pageError: PageError
  count: number
}

export type AtomicSignalRow = {
  signal: ObserverEvent["eventType"]
  observed: boolean
  status: ObservationStatus
  blockability: BlockabilityClass
  capability: string
  count: number
  latestObservedAt: number
  latestEvidence: string
}

export function pageActivityEvents(events: ObserverEvent[]) {
  return events.filter(isPageActivityEvent)
}

export function exposureScanEvents(events: ObserverEvent[]) {
  return events.filter(isExposureScanEvent)
}

export const EMPTY_SUMMARY: SiteSummary = {
  origin: "unknown",
  tabId: -1,
  activeCompanies: [],
  blockedCompanies: [],
  mitigatedCompanies: [],
  exposedSignals: [],
  cannotBlockSignals: [],
  events: [],
  pageErrors: [],
  incomplete: true,
  updatedAt: 0
}

const STATUS_RANK: Record<ObservationStatus, number> = {
  blocked: 4,
  mitigated: 3,
  active: 2,
  cannot_block: 1
}

const BLOCKABILITY_RANK: Record<BlockabilityClass, number> = {
  network_blockable: 6,
  content_mitigatable: 5,
  observable_only: 4,
  user_action_required: 3,
  pre_request_unblockable: 2,
  server_side_unblockable: 1
}

export function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function observerName(event: ObserverEvent) {
  return event.companyId ?? event.trackerId ?? (event.firstParty ? "First-party script" : "Unknown observer")
}

export function visibleSignals(summary: SiteSummary) {
  return summary.exposedSignals.filter((signal) => signal !== "extension_diagnostic")
}

export function displayEventKey(event: ObserverEvent) {
  return [
    event.companyId ?? "",
    event.trackerId ?? "",
    event.firstParty ? event.origin : "",
    event.eventType,
    event.source,
    event.status,
    event.blockability,
    typeof event.details?.apiGroup === "string" ? event.details.apiGroup : ""
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

export function eventSummary(event: ObserverEvent) {
  if (event.eventType === "canvas_read") return "Canvas data was read by page script."
  if (event.eventType === "webgl_query") return "WebGL rendering details were queried."
  if (event.eventType === "audio_fingerprint") return "Audio rendering behavior was sampled."
  if (event.eventType === "font_enumeration") return "Font surface was enumerated."
  if (event.eventType === "request_blocked") return "A tracker network request was blocked."
  if (event.eventType === "request_seen") return "A tracker network request was observed."
  if (event.eventType === "script_injected") return "A script was inserted into the page after load."
  if (event.eventType === "sdk_detected") return "A tracking SDK was initialized inside the page."
  if (event.eventType === "extension_diagnostic") return "Extension self-check."
  if (event.eventType === "browser_surface") return "Browser surface fields were readable by local JavaScript."
  return `${titleCase(event.eventType)} observed.`
}

export function blockabilitySummary(event: Pick<ObserverEvent, "blockability" | "status">) {
  if (event.blockability === "network_blockable") return event.status === "blocked" ? "Observed and blocked" : "Observed; network block available"
  if (event.blockability === "content_mitigatable") return event.status === "mitigated" ? "Observed and mitigated" : "Observed; mitigation possible"
  if (event.blockability === "observable_only") return "Observed only"
  if (event.blockability === "pre_request_unblockable") return "Observed after browser already sent it"
  if (event.blockability === "server_side_unblockable") return "Visible to the server, not blockable here"
  return "Requires source-level action"
}

export function formatDetailKey(value: string) {
  return titleCase(value).replace(/^Url$/, "URL").replace(/^Id$/, "ID")
}

export function detailEntries(event: ObserverEvent) {
  return Object.entries(event.details ?? {}).filter(([, value]) => value !== "")
}

export function formatTime(timestamp: number) {
  if (!timestamp) return "Unknown"
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(timestamp)
}

export function parseSiteSummaryResponse(response: unknown) {
  const payload =
    response && typeof response === "object" && "type" in response && response.type === "SITE_SUMMARY" && "payload" in response
      ? response.payload
      : response
  const normalizedPayload = payload && typeof payload === "object" ? { pageErrors: [], ...payload } : payload
  return SiteSummarySchema.safeParse(normalizedPayload)
}

export function formatCopyEvent(event: ObserverEvent, count: number) {
  const remediation = getObserverRemediation(event)

  return {
    id: event.id,
    count,
    lastObservedAt: new Date(event.observedAt).toISOString(),
    observer: remediation?.observerName ?? observerName(event),
    parentCompany: remediation?.parentCompany,
    origin: event.origin,
    signal: event.eventType,
    source: event.source,
    status: event.status,
    blockability: event.blockability,
    confidence: event.confidence,
    firstParty: event.firstParty,
    policyLabel: event.policyLabel,
    trackerId: event.trackerId,
    companyId: event.companyId,
    frameId: event.frameId,
    details: event.details,
    evidence: event.evidence,
    remediation
  }
}

export function buildCopyPayload(summary: SiteSummary) {
  const observations = compactEvents(summary.events)
  const pageEvents = pageActivityEvents(summary.events)
  const exposureEvents = exposureScanEvents(summary.events)
  const diagnostics = summary.events.filter(isDiagnosticEvent)

  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      origin: summary.origin,
      tabId: summary.tabId,
      incomplete: summary.incomplete,
      counts: {
        observations: observations.length,
        rawEvents: pageEvents.length,
        exposureScanEvents: exposureEvents.length,
        diagnostics: diagnostics.length,
        activeCompanies: summary.activeCompanies.length,
        blockedCompanies: summary.blockedCompanies.length,
        mitigatedCompanies: summary.mitigatedCompanies.length,
        exposedSignals: visibleSignals(summary).length,
        cannotBlockSignals: summary.cannotBlockSignals.length
      },
      perPersonValue: rollupObservedValuations(summary.events),
      observations: observations.map(({ event, count }) => formatCopyEvent(event, count)),
      pageActivityEvents: pageEvents.map((event) => formatCopyEvent(event, event.count ?? 1)),
      exposureScanEvents: exposureEvents.map((event) => formatCopyEvent(event, event.count ?? 1)),
      diagnostics: diagnostics.map((event) => formatCopyEvent(event, event.count ?? 1))
    },
    null,
    2
  )
}

function strongerStatus(left: ObservationStatus, right: ObservationStatus) {
  return STATUS_RANK[left] >= STATUS_RANK[right] ? left : right
}

function strongerBlockability(left: BlockabilityClass, right: BlockabilityClass) {
  return BLOCKABILITY_RANK[left] >= BLOCKABILITY_RANK[right] ? left : right
}

export function buildAtomicSignalRows(events: ObserverEvent[]): AtomicSignalRow[] {
  const rows = new Map<ObserverEvent["eventType"], AtomicSignalRow>()

  for (const event of events) {
    if (isDiagnosticEvent(event)) continue
    if (isExposureScanEvent(event)) continue

    const existing = rows.get(event.eventType)
    const count = event.count ?? 1
    if (!existing) {
      rows.set(event.eventType, {
        signal: event.eventType,
        observed: true,
        status: event.status,
        blockability: event.blockability,
        capability: blockabilitySummary(event),
        count,
        latestObservedAt: event.observedAt,
        latestEvidence: event.evidence[0] ?? eventSummary(event)
      })
      continue
    }

    const status = strongerStatus(existing.status, event.status)
    const blockability = strongerBlockability(existing.blockability, event.blockability)
    const latestEvent = event.observedAt >= existing.latestObservedAt ? event : null
    rows.set(event.eventType, {
      signal: event.eventType,
      observed: true,
      status,
      blockability,
      capability: blockabilitySummary({ status, blockability }),
      count: existing.count + count,
      latestObservedAt: latestEvent?.observedAt ?? existing.latestObservedAt,
      latestEvidence: latestEvent?.evidence[0] ?? existing.latestEvidence
    })
  }

  return [...rows.values()].sort((left, right) => right.latestObservedAt - left.latestObservedAt)
}