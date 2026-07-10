import type { TrackerRecord } from "~core/contracts/schemas"
import {
  findInstalledBlockRuleMetadataForRequest,
  getDynamicBlockRuleMetadata,
  type DynamicBlockRuleMetadata
} from "~core/db/dnr"
import { matchTrackerRequest } from "~core/domain/network-match"
import { isSameSite } from "~core/domain/party"
import { detectCookieSync } from "~core/signals/cookie-sync"
import { annotateEventDetail, supersedeEvent } from "~core/state/summaries"
import type { ObserverEvent, SiteSummary } from "~core/domain/types"

const UNCLASSIFIED_REQUEST_TYPES = new Set(["script", "xmlhttprequest", "image", "ping", "media", "sub_frame", "websocket"])
const CACHE_VALIDATOR_HEADERS = new Set(["etag", "if-none-match", "last-modified", "if-modified-since"])

// background.ts owns all mutable worker state (summaries, writers, hydration);
// the observer is pure webRequest/DNR wiring over these injected accessors.
export type NetworkObserverDeps = {
  ensureHydrated: () => Promise<void>
  recordEvent: (event: ObserverEvent) => Promise<void>
  readTabSummary: (tabId: number) => SiteSummary | undefined
  writeTabSummary: (tabId: number, summary: SiteSummary) => void
  scheduleSummaryWrite: () => void
  initialRuleSync: Promise<unknown>
  trackers: TrackerRecord[]
}

function requestOrigin(details: { initiator?: string | undefined; url: string }): string {
  const source = details.initiator && details.initiator !== "null" ? details.initiator : details.url
  try {
    return new URL(source).origin
  } catch {
    return "unknown"
  }
}

function requestEventId(prefix: string, tabId: number, requestId: string, trackerId: string) {
  return `${prefix}:${tabId}:${requestId}:${trackerId}`
}

function requestDetails(url: string, requestType: string, requestId: string): Record<string, string | number | boolean> {
  return { requestId, requestType, url }
}

function hostnameFromUrl(url: string) {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return "unknown"
  }
}

function isThirdPartyRequest(origin: string, url: string) {
  if (origin === "unknown") return false
  try {
    // Registrable-domain comparison, not exact hostname: media.cnn.com on
    // www.cnn.com is the site's own infrastructure, and calling it a
    // "third-party request" would be a false claim.
    return !isSameSite(new URL(origin).hostname, new URL(url).hostname)
  } catch {
    return false
  }
}

function shouldRecordUnclassifiedRequest(details: chrome.webRequest.WebRequestBodyDetails, topOrigin: string) {
  if (!UNCLASSIFIED_REQUEST_TYPES.has(details.type)) return false
  return isThirdPartyRequest(topOrigin, details.url)
}

type HeaderLike = { name: string }

function cacheValidatorHeaderNames(headers: HeaderLike[] | undefined): string[] {
  return [
    ...new Set(
      (headers ?? [])
        .map((header) => header.name)
        .filter((name) => CACHE_VALIDATOR_HEADERS.has(name.toLowerCase()))
    )
  ]
}

export function registerNetworkObserver({
  ensureHydrated,
  recordEvent,
  readTabSummary,
  writeTabSummary,
  scheduleSummaryWrite,
  initialRuleSync,
  trackers
}: NetworkObserverDeps) {
  // First/third-party must be judged against the TOP-LEVEL tab origin, not the
  // request initiator. A request the Stripe iframe makes to js.stripe.com has
  // initiator js.stripe.com, so an initiator-relative check calls it
  // first-party and launders an embedded third party into the site itself.
  // The tab's pinned top origin (set on main-frame navigation) is the honest
  // reference; fall back to the initiator only before it is known.
  function tabTopOrigin(tabId: number, fallback: string): string {
    const pinned = readTabSummary(tabId)?.origin
    return pinned && pinned !== "unknown" ? pinned : fallback
  }

  function recordCacheValidatorEvents(
    details: {
      frameId: number
      initiator?: string | undefined
      requestId: string
      tabId: number
      timeStamp: number
      type: string
      url: string
    },
    headers: HeaderLike[] | undefined,
    direction: "request" | "response"
  ) {
    if (details.tabId < 0) return

    const headerNames = cacheValidatorHeaderNames(headers)
    if (headerNames.length === 0) return

    const origin = requestOrigin(details)
    const host = hostnameFromUrl(details.url)
    const firstParty = !isThirdPartyRequest(tabTopOrigin(details.tabId, origin), details.url)

    for (const headerName of headerNames) {
      recordEvent({
        // Keyed by host + header, not requestId: nearly every static asset on
        // an ordinary page carries cache validators, and a request-keyed id
        // would flood the per-tab cap with one event per resource (evicting
        // classified tracker evidence). Host-keyed repeats merge into count.
        id: `cache_validator_seen:${details.tabId}:${host}:${direction}:${headerName.toLowerCase()}`,
        tabId: details.tabId,
        frameId: details.frameId,
        origin,
        observedAt: Math.round(details.timeStamp),
        source: "network",
        firstParty,
        ...(firstParty ? { policyLabel: "unknown_first_party" as const } : {}),
        eventType: "cache_validator_seen",
        blockability: "observable_only",
        status: "active",
        confidence: "confirmed",
        evidenceTier: "observed",
        evidence: [`${direction === "request" ? "Request" : "Response"} used cache validator header ${headerName} for ${host}. Header values are never recorded.`],
        details: {
          direction,
          headerName,
          host,
          requestId: details.requestId,
          requestType: details.type
        }
      }).catch((error: unknown) => console.warn("Failed to record cache validator event", error))
    }
  }

  chrome.webRequest?.onBeforeSendHeaders?.addListener(
    (details) => recordCacheValidatorEvents(details, details.requestHeaders, "request"),
    { urls: ["<all_urls>"] },
    ["requestHeaders"]
  )

  chrome.webRequest?.onHeadersReceived?.addListener(
    (details) => recordCacheValidatorEvents(details, details.responseHeaders, "response"),
    { urls: ["<all_urls>"] },
    ["responseHeaders"]
  )

  chrome.webRequest?.onBeforeRequest?.addListener(
    (details: chrome.webRequest.WebRequestBodyDetails) => {
      if (details.tabId < 0) return
      const matches = matchTrackerRequest({ type: details.type, url: details.url }, trackers)
      const origin = requestOrigin(details)
      const topOrigin = tabTopOrigin(details.tabId, origin)

      if (matches.length === 0 && shouldRecordUnclassifiedRequest(details, topOrigin)) {
        const host = hostnameFromUrl(details.url)
        // Keyed by host, not requestId: repeats merge into count via
        // upsertEvent. A request-keyed id would store every unmatched
        // request as a new event and let a busy page evict classified
        // tracker evidence out of the maxEventsPerTab cap.
        recordEvent({
          id: `request_unclassified:${details.tabId}:${host}`,
          tabId: details.tabId,
          frameId: details.frameId,
          origin,
          observedAt: Math.round(details.timeStamp),
          source: "network",
          firstParty: false,
          eventType: "request_seen",
          blockability: "observable_only",
          status: "active",
          confidence: "confirmed",
          evidenceTier: "observed",
          evidence: [`Third-party request observed to ${host}; no tracker record matched it.`],
          details: { ...requestDetails(details.url, details.type, details.requestId), host }
        }).catch((error: unknown) => console.warn("Failed to record unclassified network event", error))
        return
      }

      for (const match of matches) {
        recordEvent({
          id: requestEventId("request_seen", details.tabId, details.requestId, match.tracker.id),
          tabId: details.tabId,
          frameId: details.frameId,
          origin,
          observedAt: Math.round(details.timeStamp),
          source: "network",
          trackerId: match.tracker.id,
          companyId: match.tracker.companyId,
          firstParty: false,
          eventType: "request_seen",
          blockability: match.tracker.browserAction.blockability,
          status: "active",
          confidence: match.tracker.confidence,
          evidence: match.evidence,
          details: requestDetails(details.url, details.type, details.requestId)
        }).catch((error: unknown) => console.warn("Failed to record network observer event", error))

        // ID-sync detection rides the same match: a sync-shaped request is
        // recorded as its own cookie_sync observation so the report can say
        // "these companies merged their profiles of you" with URL evidence.
        const sync = detectCookieSync(details.url, match.tracker, trackers)
        if (sync) {
          recordEvent({
            id: requestEventId("cookie_sync", details.tabId, details.requestId, match.tracker.id),
            tabId: details.tabId,
            frameId: details.frameId,
            origin,
            observedAt: Math.round(details.timeStamp),
            source: "network",
            trackerId: match.tracker.id,
            companyId: match.tracker.companyId,
            firstParty: false,
            eventType: "cookie_sync",
            blockability: match.tracker.browserAction.blockability,
            status: "active",
            confidence: sync.confidence,
            evidence: sync.evidence,
            details: { ...requestDetails(details.url, details.type, details.requestId), syncIndicators: sync.indicators.join(", ") }
          }).catch((error: unknown) => console.warn("Failed to record cookie sync event", error))
        }
      }
    },
    { urls: ["<all_urls>"] }
  )

  // Shared by both deterministic block signals: onRuleMatchedDebug (richer,
  // unpacked dev builds only) and onErrorOccurred + ERR_BLOCKED_BY_CLIENT
  // matched against an installed rule (packed/store builds). One recorder so
  // the two paths can never drift in how they supersede the seen-event or
  // shape the blocked event. Both fire for the same request in dev builds:
  // the first records, the second only annotates blockSignals — one blocked
  // request never counts twice, and the stored event shows every
  // deterministic signal that confirmed it.
  async function recordBlockedOutcome(
    metadata: DynamicBlockRuleMetadata,
    request: { frameId: number; requestId: string; tabId: number; type: string; url: string; initiator?: string | undefined },
    signal: "rule_matched_debug" | "err_blocked_by_client"
  ) {
    // Same cold-start rule as recordEvent: never read or write summaries
    // before hydration has finished restoring them.
    await ensureHydrated()
    const blockedEventId = requestEventId("request_blocked", request.tabId, request.requestId, metadata.tracker.id)
    const current = readTabSummary(request.tabId)
    const existingBlocked = current?.events.find((event) => event.id === blockedEventId)

    if (existingBlocked && current) {
      const signals = new Set(
        String(existingBlocked.details?.blockSignals ?? "")
          .split(",")
          .filter(Boolean)
      )
      if (signals.has(signal)) return
      signals.add(signal)
      writeTabSummary(request.tabId, annotateEventDetail(current, blockedEventId, "blockSignals", [...signals].sort().join(",")))
      scheduleSummaryWrite()
      return
    }

    const seenEventId = requestEventId("request_seen", request.tabId, request.requestId, metadata.tracker.id)
    if (current) writeTabSummary(request.tabId, supersedeEvent(current, seenEventId))

    recordEvent({
      id: blockedEventId,
      tabId: request.tabId,
      frameId: request.frameId,
      origin: requestOrigin(request),
      observedAt: Date.now(),
      source: "network",
      trackerId: metadata.tracker.id,
      companyId: metadata.tracker.companyId,
      firstParty: false,
      eventType: "request_blocked",
      blockability: metadata.tracker.browserAction.blockability,
      // A shim's closed return path still cancels the request, but the
      // honest claim is "mitigated" (page kept working), not "blocked".
      status: metadata.action === "shim" ? "mitigated" : "blocked",
      confidence: metadata.tracker.confidence,
      evidence: [metadata.evidence],
      details: { ...requestDetails(request.url, request.type, request.requestId), blockSignals: signal }
    }).catch((error: unknown) => console.warn("Failed to record blocked network event", error))
  }

  chrome.declarativeNetRequest?.onRuleMatchedDebug?.addListener((info) => {
    if (info.request.tabId < 0) return

    initialRuleSync
      .then(() => {
        const metadata = getDynamicBlockRuleMetadata(info.rule.ruleId)
        if (!metadata) return
        return recordBlockedOutcome(metadata, info.request, "rule_matched_debug")
      })
      .catch((error: unknown) => console.warn("Failed to record blocked outcome", error))
  })

  // Production blocked-state signal: onRuleMatchedDebug never fires in a
  // packed build, but DNR cancellation surfaces as onErrorOccurred with
  // net::ERR_BLOCKED_BY_CLIENT. That error alone is not proof — another
  // extension could have blocked the request — so blocked is only claimed
  // when the URL provably matches a rule this extension installed. Anything
  // else stays seen/active per the spec's deterministic-signal rule.
  chrome.webRequest?.onErrorOccurred?.addListener(
    (details) => {
      if (details.tabId < 0 || details.error !== "net::ERR_BLOCKED_BY_CLIENT") return

      initialRuleSync
        .then(() => {
          const metadata = findInstalledBlockRuleMetadataForRequest(details.url, details.type)
          if (!metadata) return
          return recordBlockedOutcome(metadata, details, "err_blocked_by_client")
        })
        .catch((error: unknown) => console.warn("Failed to record blocked outcome", error))
    },
    { urls: ["<all_urls>"] }
  )
}
