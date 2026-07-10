import { SiteSummarySchema } from "~core/contracts/schemas"
import { isDiagnosticEvent, isExposureScanEvent, isUnclassifiedObservation } from "~core/state/summaries"
import { titleCase } from "./rollups"
import type { BlockabilityClass, ObservationStatus, ObserverEvent, SiteSummary } from "~core/domain/types"

// Per-event prose and status copy for the report surfaces. The keying/merge
// logic lives in ./compaction, the local-state rollups in ./rollups, and the
// clipboard report in ./copy-payload — all re-exported here so consumers keep
// importing from ~core/report/display.
export * from "./compaction"
export * from "./copy-payload"
export * from "./rollups"

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

// One plain sentence per signal, written for a reader with no technical
// background: concrete things (screen size, fonts, graphics card), not
// mechanisms (API, surface, SDK). Honesty rules still apply — factual,
// no reassurance, no fear copy.
export function eventSummary(event: ObserverEvent) {
  if (event.eventType === "canvas_read") return "The page read image data that can identify your device."
  if (event.eventType === "webgl_query") return "The page asked for graphics-card details that can identify your device."
  if (event.eventType === "audio_fingerprint") return "The page tested audio processing in a way that can identify your device."
  if (event.eventType === "font_enumeration") return "The page checked which fonts you have installed."
  if (event.eventType === "identity_digest_observed") return "The page created a SHA-256 identifier hash. The original value and hash were not recorded."
  if (event.eventType === "request_blocked") return "A tracking request was stopped before it left your browser."
  if (event.eventType === "request_seen" && isUnclassifiedObservation(event)) return "A third-party request left your browser. Pulse has not classified it yet."
  if (event.eventType === "request_seen") return "A tracking request left your browser."
  if (event.eventType === "script_injected") return "A new script was added to this page after it loaded."
  if (event.eventType === "sdk_detected") return "A tracking company's software is running inside this page."
  if (event.eventType === "consent_signal_observed") return "The page set up privacy-choice plumbing used by consent and ad systems."
  if (event.eventType === "cookie_sync") return "Two tracking companies swapped IDs so they can combine what they know about you."
  if (event.eventType === "cookie_observed") return "Cookie observed — the page saved a small record in your browser. Its name and size were noted; its contents were not read."
  if (event.eventType === "storage_write") return "Storage write observed — the page saved, changed, or deleted data kept in your browser for this site."
  if (event.eventType === "indexeddb_access") return "Durable storage observed — the page used a database in your browser that lasts between visits."
  if (event.eventType === "cache_storage_access") return "Durable storage observed — the page used your browser's saved-files store, which lasts between visits."
  if (event.eventType === "service_worker_registered") return "The site installed a background worker in your browser that can keep running and storing data after this page closes."
  if (event.eventType === "cache_validator_seen") return "Cache identifier observed — the browser used a freshness marker for saved content. The marker value was not recorded."
  if (event.eventType === "extension_diagnostic") return "A routine self-check by this extension — not something the page did."
  if (event.eventType === "browser_surface") return "Basic facts about your device (screen size, time zone, language) were readable by this page."
  return `${titleCase(event.eventType)} observed.`
}

export function blockabilitySummary(event: Pick<ObserverEvent, "blockability" | "status">) {
  if (event.blockability === "network_blockable") return event.status === "blocked" ? "Seen, then blocked" : "Seen — you can block it"
  if (event.blockability === "content_mitigatable") return event.status === "mitigated" ? "Seen, and limited" : "Seen — it can be limited"
  if (event.blockability === "observable_only") return "Seen — can be watched but not stopped"
  if (event.blockability === "pre_request_unblockable") return "Sent before this extension could act"
  if (event.blockability === "server_side_unblockable") return "Happens on the company's servers — no extension can stop it"
  return "Only fixable at the source — see Stop at source"
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
