import browser from "webextension-polyfill"
import type { Runtime } from "webextension-polyfill"

import { RuntimeMessageSchema } from "~core/contracts/schemas"
import { getDynamicBlockRuleMetadata, installDynamicBlockRules, uninstallDynamicBlockRules } from "~core/db/dnr"
import { validateTrackerDatabase } from "~core/db/validate"
import { MAIN_WORLD_SCRIPT_ID } from "~core/domain/constants"
import { matchTrackerRequest } from "~core/domain/network-match"
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
import { normalizePersistenceEvent } from "~core/signals/persistence"
import { enrichSdkDetection } from "~core/signals/sdk-globals"
import { createCoalescedWriter } from "~core/state/coalesced-writer"
import { createEmptySiteSummary, normalizeSiteSummary, pruneExpiredEvents, recordPageError, supersedeEvent, upsertEvent } from "~core/state/summaries"
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
  skipReportOpenConfirm: false
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
  summaries.set(event.tabId, upsertEvent(current, event, settings.maxEventsPerTab))
  const visit = await ensureSiteVisitForTab(event.tabId, summaries.get(event.tabId)?.origin ?? event.origin, event.observedAt)
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

function registerNetworkObserver() {
  chrome.webRequest?.onBeforeRequest?.addListener(
    (details: chrome.webRequest.WebRequestBodyDetails) => {
      if (details.tabId < 0) return
      const matches = matchTrackerRequest({ type: details.type, url: details.url }, trackers)

      for (const match of matches) {
        recordEvent({
          id: requestEventId("request_seen", details.tabId, details.requestId, match.tracker.id),
          tabId: details.tabId,
          frameId: details.frameId,
          origin: requestOrigin(details),
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
            origin: requestOrigin(details),
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

  chrome.declarativeNetRequest?.onRuleMatchedDebug?.addListener((info) => {
    const metadata = getDynamicBlockRuleMetadata(info.rule.ruleId)
    if (!metadata || info.request.tabId < 0) return

    // The webRequest observer may have logged this same request as seen
    // before the block outcome arrived — supersede it so one blocked
    // request never counts its company as both watching and blocked.
    const seenEventId = requestEventId("request_seen", info.request.tabId, info.request.requestId, metadata.tracker.id)
    const current = summaries.get(info.request.tabId)
    if (current) summaries.set(info.request.tabId, supersedeEvent(current, seenEventId))

    recordEvent({
      id: requestEventId("request_blocked", info.request.tabId, info.request.requestId, metadata.tracker.id),
      tabId: info.request.tabId,
      frameId: info.request.frameId,
      origin: requestOrigin(info.request),
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
      details: requestDetails(info.request.url, info.request.type, info.request.requestId)
    }).catch((error: unknown) => console.warn("Failed to record blocked network event", error))
  })
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
      summaries.set(tabId, createEmptySiteSummary(origin, tabId))
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

      await recordEvent(normalizePersistenceEvent(enrichSdkDetection(enrichScriptInjection(event), trackers)))
      return { ok: true }
    }

    if (message.type === "PAGE_ERROR_OBSERVED") {
      const tabId = sender.tab?.id
      if (tabId === undefined) return { ok: false, error: "no_tab_id" }

      const pageError: PageError = { id: crypto.randomUUID(), ...message.payload }
      const current = readSummary(tabId, senderOrigin(sender) ?? "unknown")
      summaries.set(tabId, recordPageError(current, pageError))
      summaryWriter.schedule()
      return { ok: true }
    }

    if (message.type === "GET_SITE_SUMMARY") {
      return { type: "SITE_SUMMARY", payload: readSummary(message.tabId) }
    }

    if (message.type === "GET_VALUATION_ROLLUP") {
      return { type: "VALUATION_ROLLUP", payload: rollupValuationLedger(valuationLedger, message.period) }
    }

    if (message.type === "REFRESH_TAB_SCAN") {
      const summary = { ...(await recordActiveTabScan(message.tabId)), updatedAt: Date.now() }
      summaries.set(message.tabId, summary)
      summaryWriter.schedule()
      return { type: "SITE_SUMMARY", payload: summary }
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