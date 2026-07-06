import browser from "webextension-polyfill"
import type { Runtime } from "webextension-polyfill"
import * as z from "zod"

import { runConsentAudit, type AnchorInput, type ConsentAuditRecord } from "~core/atlas/audit"
import { hasCookieMetadataPermission, requestCookieMetadataPermission, scanSiteCookieMetadata } from "~core/browser/cookie-store"
import { RuntimeMessageSchema } from "~core/contracts/schemas"
import {
  findInstalledBlockRuleMetadataForRequest,
  getDynamicBlockRuleMetadata,
  installDynamicBlockRules,
  uninstallDynamicBlockRules,
  type DynamicBlockRuleMetadata
} from "~core/db/dnr"
import { validateTrackerDatabase } from "~core/db/validate"
import { MAIN_WORLD_SCRIPT_ID } from "~core/domain/constants"
import { matchTrackerRequest } from "~core/domain/network-match"
import { untrustedObservedEventReason } from "~core/domain/message-guards"
import { isSameSite, registrableDomain } from "~core/domain/party"
import { filterBlockableTrackerIds } from "~core/domain/blocking-policy"
import {
  createEmptyValuationLedger,
  normalizeValuationLedger,
  pruneValuationLedger,
  recordSiteVisit,
  rollupValuationLedger,
  upsertValuationLedgerEvent
} from "~core/domain/valuation-ledger"
import { detectCookieSync } from "~core/signals/cookie-sync"
import { badgeTextForSummary } from "~core/report/badge"
import { normalizeConsentSignal } from "~core/signals/consent-signals"
import { normalizeIdentityDigestEvent } from "~core/signals/identity-digest"
import { normalizePersistenceEvent } from "~core/signals/persistence"
import { enrichSdkDetection } from "~core/signals/sdk-globals"
import { createCoalescedWriter } from "~core/state/coalesced-writer"
import {
  annotateEventDetail,
  createEmptySiteSummary,
  normalizeSiteSummary,
  pruneExpiredEvents,
  recordPageError,
  supersedeEvent,
  upsertEvent
} from "~core/state/summaries"
import type { ObserverEvent, PageError, RuntimeMessage, SiteSummary, UserSettings } from "~core/domain/types"

const summaries = new Map<number, SiteSummary>()
const recentEventFingerprints = new Map<string, number>()
const SUMMARY_STORAGE_KEY = "siteSummaries"
const SETTINGS_STORAGE_KEY = "userSettings"
const VALUATION_LEDGER_STORAGE_KEY = "valuationLedger"
const CONTENT_EVENT_DEDUPE_TTL_MS = 750

// This is primarily an observer, not a blocker: blockedTrackerIds starts
// empty so installing/enabling the extension never changes site behavior by
// itself. Blocking is a per-tracker choice made from the popup, right where
// that tracker is observed — not a single global switch.
const DEFAULT_SETTINGS: UserSettings = {
  retentionDays: 14,
  maxEventsPerTab: 100,
  blockedTrackerIds: [],
  mitigateCanvas: false,
  mitigateAudio: false,
  mitigateWebgl: false,
  skipReportOpenConfirm: false,
  siteVisitFrequency: {}
}

let settings = DEFAULT_SETTINGS
let valuationLedger = createEmptyValuationLedger()
const hydration = hydrateState()

function senderOrigin(sender: Runtime.MessageSender) {
  const url = sender.url ?? sender.tab?.url
  if (!url) return null
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

function plainSummaries() {
  return Object.fromEntries([...summaries.entries()].map(([tabId, summary]) => [String(tabId), summary]))
}

async function persistSummaries() {
  await browser.storage.local.set({ [SUMMARY_STORAGE_KEY]: plainSummaries() })
}

async function persistSettings() {
  await browser.storage.local.set({ [SETTINGS_STORAGE_KEY]: settings })
}

async function persistValuationLedger() {
  await browser.storage.local.set({ [VALUATION_LEDGER_STORAGE_KEY]: valuationLedger })
}

function updateActionBadge(tabId: number, summary: SiteSummary) {
  if (typeof chrome === "undefined" || !chrome.action?.setBadgeText) return

  const text = badgeTextForSummary(summary)
  Promise.resolve(chrome.action.setBadgeText({ tabId, text })).catch(() => undefined)
  if (text) {
    Promise.resolve(chrome.action.setBadgeBackgroundColor?.({ tabId, color: "#B85B12" })).catch(() => undefined)
  }
}

// Every event used to await a full serialization of ALL tab summaries plus
// the valuation ledger — a tracker-heavy page rewrites the whole map dozens
// of times in a burst. Coalesced writers batch each burst into one write;
// reads (popup, report) come from memory, so nothing user-visible waits on
// storage. The 250ms window is far inside Chromium's ~30s service-worker
// idle timeout, and onSuspend flushes as a belt-and-braces.
const summaryWriter = createCoalescedWriter(persistSummaries)
const ledgerWriter = createCoalescedWriter(persistValuationLedger)

if (typeof chrome !== "undefined") {
  chrome.runtime?.onSuspend?.addListener(() => {
    summaryWriter.flush().catch(() => undefined)
    ledgerWriter.flush().catch(() => undefined)
  })
}

async function hydrateState() {
  const stored = await browser.storage.local.get([SUMMARY_STORAGE_KEY, SETTINGS_STORAGE_KEY, VALUATION_LEDGER_STORAGE_KEY])
  const storedSettings = stored[SETTINGS_STORAGE_KEY] as Partial<UserSettings> | undefined
  settings = { ...DEFAULT_SETTINGS, ...storedSettings }
  valuationLedger = pruneValuationLedger(normalizeValuationLedger(stored[VALUATION_LEDGER_STORAGE_KEY]), settings.retentionDays)

  const storedSummaries = stored[SUMMARY_STORAGE_KEY] as Record<string, Partial<SiteSummary>> | undefined
  summaries.clear()
  for (const [tabId, summary] of Object.entries(storedSummaries ?? {})) {
    const numericTabId = Number(tabId)
    summaries.set(numericTabId, pruneExpiredEvents(normalizeSiteSummary(summary, summary.origin, numericTabId), settings.retentionDays))
  }
}

async function ensureHydrated() {
  await hydration
}

async function clearLocalData() {
  summaries.clear()
  await clearValuationLedger()
  // Flush after clearing memory: a pending coalesced write now persists the
  // empty state instead of resurrecting cleared data after the remove.
  await summaryWriter.flush()
  await browser.storage.local.remove(SUMMARY_STORAGE_KEY)
}

async function clearValuationLedger() {
  valuationLedger = createEmptyValuationLedger()
  activeVisitByTabId.clear()
  await ledgerWriter.flush()
  await browser.storage.local.remove(VALUATION_LEDGER_STORAGE_KEY)
}

function originMatchesSender(event: ObserverEvent, sender: Runtime.MessageSender) {
  const origin = senderOrigin(sender)
  return !origin || origin === event.origin
}

function sameTrackerIdSet(a: readonly string[], b: readonly string[]) {
  if (a.length !== b.length) return false
  const bSet = new Set(b)
  return a.every((id) => bSet.has(id))
}

// retentionDays is a settings-level age cutoff; maxEventsPerTab is a count
// cap. Both are enforced here on every read so a tab left open for months
// never accumulates event history past either bound.
function readSummary(tabId: number, origin = "unknown") {
  const existing = normalizeSiteSummary(summaries.get(tabId) ?? createEmptySiteSummary(origin, tabId), origin, tabId)
  const pruned = pruneExpiredEvents(existing, settings.retentionDays)
  if (pruned !== existing) summaries.set(tabId, pruned)
  return pruned
}

// Shared by both the OBSERVED_EVENT message handler (content-script/api-hook
// events) and the webRequest network observer below — one place that reads,
// merges, and persists a summary update.
async function recordEvent(event: ObserverEvent) {
  if (isDuplicateContentEvent(event)) return

  const current = readSummary(event.tabId, event.origin)
  const summary = upsertEvent(current, event, settings.maxEventsPerTab)
  summaries.set(event.tabId, summary)
  updateActionBadge(event.tabId, summary)
  const visit = await ensureSiteVisitForTab(event.tabId, summary.origin ?? event.origin, event.observedAt)
  valuationLedger = pruneValuationLedger(upsertValuationLedgerEvent(valuationLedger, { ...event, origin: visit.origin }, visit.visitId), settings.retentionDays)
  summaryWriter.schedule()
  ledgerWriter.schedule()
}

type ActiveVisit = { origin: string; startedAt: number; visitId: string }

const activeVisitByTabId = new Map<number, ActiveVisit>()

async function startSiteVisitForTab(tabId: number, origin: string, observedAt = Date.now()): Promise<ActiveVisit | null> {
  if (origin === "unknown") return null
  const visit = { origin, startedAt: observedAt, visitId: crypto.randomUUID() }
  activeVisitByTabId.set(tabId, visit)
  valuationLedger = pruneValuationLedger(recordSiteVisit(valuationLedger, visit.visitId, origin, observedAt), settings.retentionDays)
  ledgerWriter.schedule()
  return visit
}

async function ensureSiteVisitForTab(tabId: number, origin: string, observedAt = Date.now()): Promise<ActiveVisit> {
  const existing = activeVisitByTabId.get(tabId)
  if (existing && existing.origin === origin) return existing

  const started = await startSiteVisitForTab(tabId, origin, observedAt)
  return started ?? { origin, startedAt: observedAt, visitId: `unknown:${tabId}:${observedAt}` }
}

function pruneRecentEventFingerprints(now: number) {
  for (const [fingerprint, expiresAt] of recentEventFingerprints.entries()) {
    if (expiresAt <= now) recentEventFingerprints.delete(fingerprint)
  }
}

function semanticEventFingerprint(event: ObserverEvent) {
  return [event.tabId, event.origin, event.source, event.eventType, event.status, event.evidence[0] ?? ""].join("|")
}

function isDuplicateContentEvent(event: ObserverEvent) {
  if (event.source === "network") return false

  const now = Date.now()
  pruneRecentEventFingerprints(now)
  const fingerprint = semanticEventFingerprint(event)
  if (recentEventFingerprints.has(fingerprint)) return true

  recentEventFingerprints.set(fingerprint, now + CONTENT_EVENT_DEDUPE_TTL_MS)
  return false
}

// The only place DNR rules get installed or removed — keeps the live rule
// set in sync with settings.blockedTrackerIds, so unblocking a tracker from
// the popup actually stops it immediately, not just future installs.
async function syncBlockingRules() {
  // Defense in depth: high-breakage trackers never get DNR rules, even if
  // an old stored settings blob or forged message lists them.
  const blockable = filterBlockableTrackerIds(settings.blockedTrackerIds)
  if (blockable.length > 0) {
    await installDynamicBlockRules(blockable)
  } else {
    await uninstallDynamicBlockRules()
  }
}

ensureHydrated()
  .then(syncBlockingRules)
  .catch((error: unknown) => console.warn("Failed to sync DNR rules", error))

const { trackers } = validateTrackerDatabase()
const UNCLASSIFIED_REQUEST_TYPES = new Set(["script", "xmlhttprequest", "image", "ping", "media", "sub_frame", "websocket"])
const CACHE_VALIDATOR_HEADERS = new Set(["etag", "if-none-match", "last-modified", "if-modified-since"])

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

function originFromUrl(url: string | undefined) {
  if (!url) return "unknown"
  try {
    return new URL(url).origin
  } catch {
    return "unknown"
  }
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

// First/third-party must be judged against the TOP-LEVEL tab origin, not the
// request initiator. A request the Stripe iframe makes to js.stripe.com has
// initiator js.stripe.com, so an initiator-relative check calls it
// first-party and launders an embedded third party into the site itself.
// The tab's pinned top origin (set on main-frame navigation) is the honest
// reference; fall back to the initiator only before it is known.
function tabTopOrigin(tabId: number, fallback: string): string {
  const pinned = summaries.get(tabId)?.origin
  return pinned && pinned !== "unknown" ? pinned : fallback
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

// A dom_script event carries only what the content script can see: a script
// element and its src. The tracker DB join happens here so a known vendor's
// injection gets named (e.g. connect.facebook.net → Meta) with deterministic
// evidence, while unknown scripts stay honestly unattributed.
function enrichScriptInjection(event: ObserverEvent): ObserverEvent {
  if (event.eventType !== "script_injected" || event.trackerId) return event

  const src = typeof event.details?.src === "string" ? event.details.src : undefined
  if (!src) return event

  const match = matchTrackerRequest({ type: "script", url: src }, trackers)[0]
  if (!match) return event

  return {
    ...event,
    trackerId: match.tracker.id,
    companyId: match.tracker.companyId,
    firstParty: false,
    policyLabel: undefined,
    confidence: match.tracker.confidence,
    evidence: [...event.evidence, ...match.evidence]
  }
}

async function recordActiveTabScan(tabId: number) {
  const tab = await browser.tabs.get(tabId)
  const origin = originFromUrl(tab.url)
  await ensureSiteVisitForTab(tabId, origin)
  const evidence = ["Proof popup requested a live scan for this tab."]
  let scanReachedPage = true

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: "ISOLATED",
      func: () => location.origin
    })
    evidence.push("Proof active-tab scan reached this page. Reload the tab to attach document-start API hooks if this tab was open before the extension was loaded.")
  } catch (error) {
    console.warn("Failed to run active tab scan", error)
    scanReachedPage = false
    evidence.push("Chrome refused active script injection on this tab. This can happen on browser pages, extension pages, restricted URLs, or stale tabs.")
  }

  // A refused injection is a scan limitation, not an observation of page
  // behavior — it must not carry the same confident shape as a successful
  // scan, or the report contradicts its own evidence text.
  const event: ObserverEvent = {
    id: `active_tab_scan:${tabId}:${origin}`,
    tabId,
    origin,
    observedAt: Date.now(),
    source: "content",
    firstParty: true,
    ...(scanReachedPage ? { policyLabel: "unknown_first_party" as const } : {}),
    eventType: "extension_diagnostic",
    blockability: "observable_only",
    status: "active",
    confidence: scanReachedPage ? "confirmed" : "weak",
    evidence
  }

  await recordEvent(event)
  return readSummary(tabId, origin)
}

async function scanCookieMetadataForTab(tabId: number): Promise<RuntimeMessage> {
  let tab: browser.Tabs.Tab
  try {
    tab = await browser.tabs.get(tabId)
  } catch {
    return { type: "COOKIE_METADATA_SCAN", payload: { status: "no_tab", events: [] } }
  }

  const result = await scanSiteCookieMetadata({ origin: originFromUrl(tab.url), tabId })
  for (const event of result.events) await recordEvent(event)
  return { type: "COOKIE_METADATA_SCAN", payload: result }
}

// Live consent audit of the site currently seen (docs/consent-atlas-tab-spec.md).
// The page's own anchors replace the atlas crawler: harvest them on demand,
// classify legal-document links, fetch documents on this site's own domain,
// and run the deterministic clause detector. User-initiated only — never per
// navigation. Cached by registrable domain with a short TTL: repeat opens of
// the tab reuse the cached record instead of re-fetching up to five policy
// documents; a fresh audit runs once the TTL lapses.
const consentAudits = new Map<string, ConsentAuditRecord>()
const CONSENT_AUDIT_TTL_MS = 15 * 60 * 1000

const HarvestedAnchorsSchema = z.array(z.object({ text: z.string(), href: z.string() }))

async function runConsentAuditForTab(tabId: number): Promise<RuntimeMessage> {
  let tabUrl: string
  try {
    const tab = await browser.tabs.get(tabId)
    if (!tab.url || !/^https?:/i.test(tab.url)) return { type: "CONSENT_AUDIT_FAILED", reason: "restricted_page" }
    tabUrl = tab.url
  } catch {
    return { type: "CONSENT_AUDIT_FAILED", reason: "no_tab" }
  }

  const domain = registrableDomain(new URL(tabUrl).hostname) || new URL(tabUrl).hostname

  const cached = consentAudits.get(domain)
  if (cached && Date.now() - cached.auditedAt < CONSENT_AUDIT_TTL_MS) {
    return { type: "CONSENT_AUDIT", payload: cached }
  }

  let anchors: AnchorInput[]
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "ISOLATED",
      func: () =>
        Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"), (anchor) => ({
          text: (anchor.textContent ?? "").trim().slice(0, 200),
          href: anchor.href
        }))
    })
    const parsedAnchors = HarvestedAnchorsSchema.safeParse(result?.result ?? [])
    if (!parsedAnchors.success) return { type: "CONSENT_AUDIT_FAILED", reason: "anchor_harvest_failed" }
    anchors = parsedAnchors.data
  } catch (error) {
    console.warn("Consent audit could not read this page's links", error)
    return { type: "CONSENT_AUDIT_FAILED", reason: "anchor_harvest_failed" }
  }

  const record = await runConsentAudit(domain, anchors, tabUrl)
  consentAudits.set(domain, record)
  return { type: "CONSENT_AUDIT", payload: record }
}

function registerNetworkObserver() {
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
  function recordBlockedOutcome(
    metadata: DynamicBlockRuleMetadata,
    request: { frameId: number; requestId: string; tabId: number; type: string; url: string; initiator?: string | undefined },
    signal: "rule_matched_debug" | "err_blocked_by_client"
  ) {
    const blockedEventId = requestEventId("request_blocked", request.tabId, request.requestId, metadata.tracker.id)
    const current = summaries.get(request.tabId)
    const existingBlocked = current?.events.find((event) => event.id === blockedEventId)

    if (existingBlocked && current) {
      const signals = new Set(
        String(existingBlocked.details?.blockSignals ?? "")
          .split(",")
          .filter(Boolean)
      )
      if (signals.has(signal)) return
      signals.add(signal)
      summaries.set(request.tabId, annotateEventDetail(current, blockedEventId, "blockSignals", [...signals].sort().join(",")))
      summaryWriter.schedule()
      return
    }

    const seenEventId = requestEventId("request_seen", request.tabId, request.requestId, metadata.tracker.id)
    if (current) summaries.set(request.tabId, supersedeEvent(current, seenEventId))

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
      status: "blocked",
      confidence: metadata.tracker.confidence,
      evidence: [metadata.evidence],
      details: { ...requestDetails(request.url, request.type, request.requestId), blockSignals: signal }
    }).catch((error: unknown) => console.warn("Failed to record blocked network event", error))
  }

  chrome.declarativeNetRequest?.onRuleMatchedDebug?.addListener((info) => {
    const metadata = getDynamicBlockRuleMetadata(info.rule.ruleId)
    if (!metadata || info.request.tabId < 0) return

    recordBlockedOutcome(metadata, info.request, "rule_matched_debug")
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

      const metadata = findInstalledBlockRuleMetadataForRequest(details.url, details.type)
      if (!metadata) return

      recordBlockedOutcome(metadata, details, "err_blocked_by_client")
    },
    { urls: ["<all_urls>"] }
  )
}

registerNetworkObserver()

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Plasmo's generated static/background/index.ts imports src/background
// (this file) before ./main-world-scripts (which calls
// chrome.scripting.registerContentScripts). Checking immediately on cold
// start races that registration and reliably finds nothing yet — this isn't
// a real failure, so retry briefly before concluding registration is
// actually missing.
async function ensureMainWorldObserverRegistered() {
  if (typeof chrome === "undefined" || !chrome.scripting?.getRegisteredContentScripts) return

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const scripts = await chrome.scripting.getRegisteredContentScripts({ ids: [MAIN_WORLD_SCRIPT_ID] })
    if (scripts.length > 0) return
    await wait(200)
  }

  console.warn("Main-world observer script was not registered by Plasmo")
}

ensureMainWorldObserverRegistered().catch((error: unknown) => console.warn("Failed to verify main-world observer", error))

browser.runtime.onInstalled.addListener(() => {
  ensureHydrated()
    .then(syncBlockingRules)
    .catch((error: unknown) => console.warn("Failed to sync DNR rules", error))
  ensureMainWorldObserverRegistered().catch((error: unknown) => console.warn("Failed to verify main-world observer", error))
})

browser.tabs.onRemoved.addListener((tabId) => {
  summaries.delete(tabId)
  activeVisitByTabId.delete(tabId)
  summaryWriter.schedule()
})

// A summary describes the page the user is on now. When the tab's top-level
// document moves to a different origin, the old origin's events must not
// carry over — otherwise the report claims observers from pages the user has
// already left (e.g. YouTube trackers shown on a claude.ai report).
browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url) return
  const origin = originFromUrl(changeInfo.url)
  if (origin === "unknown") return

  // Set unconditionally, even when no summary exists yet — otherwise the
  // first recorded event (which can be an iframe-initiated tracker request
  // carrying the iframe's origin) would create the summary and pin the wrong
  // top-level origin.
  if (summaries.get(tabId)?.origin === origin) return

  ensureHydrated()
    .then(() => {
      const summary = createEmptySiteSummary(origin, tabId)
      summaries.set(tabId, summary)
      updateActionBadge(tabId, summary)
      summaryWriter.schedule()
      return startSiteVisitForTab(tabId, origin).then(() => undefined)
    })
    .catch((error: unknown) => console.warn("Failed to reset summary on navigation", error))
})

browser.runtime.onMessage.addListener((rawMessage: unknown, sender: Runtime.MessageSender) => {
  const parsedMessage = RuntimeMessageSchema.safeParse(rawMessage)
  if (!parsedMessage.success) return Promise.resolve({ ok: false, error: "invalid_message" })

  const message = parsedMessage.data as RuntimeMessage

  return (async () => {
    await ensureHydrated()

    if (message.type === "OBSERVED_EVENT") {
      const event = { ...message.payload, tabId: sender.tab?.id ?? message.payload.tabId } as ObserverEvent
      if (!originMatchesSender(event, sender)) return { ok: false, error: "origin_mismatch" }

      const untrustedReason = untrustedObservedEventReason(event)
      if (untrustedReason) return { ok: false, error: untrustedReason }

      await recordEvent(normalizePersistenceEvent(normalizeIdentityDigestEvent(normalizeConsentSignal(enrichSdkDetection(enrichScriptInjection(event), trackers)))))
      return { ok: true }
    }

    if (message.type === "PAGE_ERROR_OBSERVED") {
      const tabId = sender.tab?.id
      if (tabId === undefined) return { ok: false, error: "no_tab_id" }

      const pageError: PageError = { id: crypto.randomUUID(), ...message.payload }
      const current = readSummary(tabId, senderOrigin(sender) ?? "unknown")
      const summary = recordPageError(current, pageError)
      summaries.set(tabId, summary)
      updateActionBadge(tabId, summary)
      summaryWriter.schedule()
      return { ok: true }
    }

    if (message.type === "GET_SITE_SUMMARY") {
      return { type: "SITE_SUMMARY", payload: readSummary(message.tabId) }
    }

    if (message.type === "GET_COOKIE_METADATA_PERMISSION") {
      return { type: "COOKIE_METADATA_PERMISSION", granted: await hasCookieMetadataPermission() }
    }

    if (message.type === "REQUEST_COOKIE_METADATA_PERMISSION") {
      return { type: "COOKIE_METADATA_PERMISSION", granted: await requestCookieMetadataPermission() }
    }

    if (message.type === "SCAN_SITE_COOKIES") {
      return scanCookieMetadataForTab(message.tabId)
    }

    if (message.type === "GET_VALUATION_ROLLUP") {
      return { type: "VALUATION_ROLLUP", payload: rollupValuationLedger(valuationLedger, message.period) }
    }

    if (message.type === "REFRESH_TAB_SCAN") {
      const summary = { ...(await recordActiveTabScan(message.tabId)), updatedAt: Date.now() }
      summaries.set(message.tabId, summary)
      updateActionBadge(message.tabId, summary)
      summaryWriter.schedule()
      return { type: "SITE_SUMMARY", payload: summary }
    }

    if (message.type === "RUN_CONSENT_AUDIT") {
      return runConsentAuditForTab(message.tabId)
    }

    if (message.type === "GET_SETTINGS") {
      return { type: "SETTINGS", payload: settings }
    }

    if (message.type === "UPDATE_SETTINGS") {
      const blockingChanged =
        message.payload.blockedTrackerIds !== undefined &&
        !sameTrackerIdSet(message.payload.blockedTrackerIds, settings.blockedTrackerIds)
      settings = { ...settings, ...message.payload }
      await persistSettings()
      if (blockingChanged) await syncBlockingRules()
      return { ok: true, payload: settings }
    }

    if (message.type === "CLEAR_VALUATION_LEDGER") {
      await clearValuationLedger()
      return { ok: true }
    }

    if (message.type === "CLEAR_LOCAL_DATA") {
      await clearLocalData()
      return { ok: true }
    }

    return { ok: false, error: "unhandled_message" }
  })()
})
