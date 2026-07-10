import browser from "webextension-polyfill"

import { generateAiAuditReport } from "~core/ai/audit-client"
import { runConsentAuditForTab } from "~core/atlas/tab-audit"
import { hasCookieMetadataPermission, inspectSiteCookieValues, requestCookieMetadataPermission, scanSiteCookieMetadata } from "~core/browser/cookie-store"
import { installDynamicBlockRules, uninstallDynamicBlockRules } from "~core/db/dnr"
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
import { createRuntimeMessageRouter } from "~core/messaging/router"
import { registerNetworkObserver } from "~core/network/observer"
import { badgeTextForSummary } from "~core/report/badge"
import { normalizeConsentSignal } from "~core/signals/consent-signals"
import { normalizeIdentityDigestEvent } from "~core/signals/identity-digest"
import { normalizePersistenceEvent } from "~core/signals/persistence"
import { enrichSdkDetection } from "~core/signals/sdk-globals"
import { createCoalescedWriter } from "~core/state/coalesced-writer"
import { createEmptySiteSummary, normalizeSiteSummary, pruneExpiredEvents, recordPageError, upsertEvent } from "~core/state/summaries"
import type { ObserverEvent, RuntimeMessage, SiteSummary, UserSettings } from "~core/domain/types"

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
  cookieMetadataEnabled: false,
  siteVisitFrequency: {}
}

let settings = DEFAULT_SETTINGS
let valuationLedger = createEmptyValuationLedger()
const hydration = hydrateState()

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
// events) and the webRequest network observer — one place that reads,
// merges, and persists a summary update.
async function recordEvent(event: ObserverEvent) {
  // The webRequest listeners register synchronously at worker startup and can
  // fire before stored state finishes rehydrating; an event recorded onto the
  // pre-hydration map would be wiped by hydrateState's summaries.clear().
  // Waiting here means a worker respawn never loses the tab's stored history.
  await ensureHydrated()
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

// Kept as a named promise: dynamic DNR rules survive a service-worker restart
// but the attribution metadata map does not, so the blocked-signal listeners
// in the network observer await this before matching — otherwise blocks by
// our own persisted rules would go unattributed between worker wake and this
// sync finishing.
const initialRuleSync = ensureHydrated()
  .then(syncBlockingRules)
  .catch((error: unknown) => console.warn("Failed to sync DNR rules", error))

const { trackers } = validateTrackerDatabase()

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

async function inspectCookieValuesForTab(tabId: number): Promise<RuntimeMessage> {
  let tab: browser.Tabs.Tab
  try {
    tab = await browser.tabs.get(tabId)
  } catch {
    return { type: "COOKIE_VALUE_INSPECT", payload: { status: "no_tab", cookies: [] } }
  }

  return { type: "COOKIE_VALUE_INSPECT", payload: await inspectSiteCookieValues({ origin: originFromUrl(tab.url) }) }
}

registerNetworkObserver({
  ensureHydrated,
  recordEvent,
  readTabSummary: (tabId) => summaries.get(tabId),
  writeTabSummary: (tabId, summary) => summaries.set(tabId, summary),
  scheduleSummaryWrite: () => summaryWriter.schedule(),
  initialRuleSync,
  trackers
})

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

browser.runtime.onMessage.addListener(
  createRuntimeMessageRouter({
    ensureHydrated,
    recordObservedEvent: (event) =>
      recordEvent(normalizePersistenceEvent(normalizeIdentityDigestEvent(normalizeConsentSignal(enrichSdkDetection(enrichScriptInjection(event), trackers))))),
    recordPageError: (tabId, origin, pageError) => {
      const summary = recordPageError(readSummary(tabId, origin), pageError)
      summaries.set(tabId, summary)
      updateActionBadge(tabId, summary)
      summaryWriter.schedule()
    },
    readSummary,
    hasCookieMetadataPermission,
    requestCookieMetadataPermission,
    scanCookieMetadataForTab,
    inspectCookieValuesForTab,
    rollupValuation: (period) => rollupValuationLedger(valuationLedger, period),
    refreshTabScan: async (tabId) => {
      const summary = { ...(await recordActiveTabScan(tabId)), updatedAt: Date.now() }
      summaries.set(tabId, summary)
      updateActionBadge(tabId, summary)
      summaryWriter.schedule()
      return summary
    },
    runConsentAuditForTab,
    generateAiAuditReport,
    getSettings: () => settings,
    updateSettings: async (payload) => {
      const blockingChanged =
        payload.blockedTrackerIds !== undefined && !sameTrackerIdSet(payload.blockedTrackerIds, settings.blockedTrackerIds)
      settings = { ...settings, ...payload }
      await persistSettings()
      if (blockingChanged) await syncBlockingRules()
      return settings
    },
    clearValuationLedger,
    clearLocalData
  })
)
