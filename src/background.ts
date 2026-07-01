import browser from "webextension-polyfill"
import type { Runtime } from "webextension-polyfill"

import { RuntimeMessageSchema } from "~core/contracts/schemas"
import { installDynamicBlockRules } from "~core/db/dnr"
import { createEmptySiteSummary, pruneExpiredEvents, upsertEvent } from "~core/state/summaries"
import type { ObserverEvent, RuntimeMessage, SiteSummary, UserSettings } from "~core/domain/types"

const summaries = new Map<number, SiteSummary>()
const SUMMARY_STORAGE_KEY = "siteSummaries"
const SETTINGS_STORAGE_KEY = "userSettings"
const MAIN_WORLD_SCRIPT_ID = "srcContentsPageObserver"

const DEFAULT_SETTINGS: UserSettings = {
  retentionDays: 14,
  maxEventsPerTab: 100,
  mitigateCanvas: false,
  mitigateAudio: false,
  mitigateWebgl: false
}

let settings = DEFAULT_SETTINGS
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

async function hydrateState() {
  const stored = await browser.storage.local.get([SUMMARY_STORAGE_KEY, SETTINGS_STORAGE_KEY])
  const storedSettings = stored[SETTINGS_STORAGE_KEY] as Partial<UserSettings> | undefined
  settings = { ...DEFAULT_SETTINGS, ...storedSettings }

  const storedSummaries = stored[SUMMARY_STORAGE_KEY] as Record<string, SiteSummary> | undefined
  summaries.clear()
  for (const [tabId, summary] of Object.entries(storedSummaries ?? {})) {
    summaries.set(Number(tabId), pruneExpiredEvents(summary, settings.retentionDays))
  }
}

async function ensureHydrated() {
  await hydration
}

async function clearLocalData() {
  summaries.clear()
  await browser.storage.local.remove(SUMMARY_STORAGE_KEY)
}

function originMatchesSender(event: ObserverEvent, sender: Runtime.MessageSender) {
  const origin = senderOrigin(sender)
  return !origin || origin === event.origin
}

// retentionDays is a settings-level age cutoff; maxEventsPerTab is a count
// cap. Both are enforced here on every read so a tab left open for months
// never accumulates event history past either bound.
function readSummary(tabId: number, origin = "unknown") {
  const existing = summaries.get(tabId) ?? createEmptySiteSummary(origin, tabId)
  const pruned = pruneExpiredEvents(existing, settings.retentionDays)
  if (pruned !== existing) summaries.set(tabId, pruned)
  return pruned
}

installDynamicBlockRules().catch((error: unknown) => console.warn("Failed to install DNR rules", error))

async function ensureMainWorldObserverRegistered() {
  if (typeof chrome === "undefined" || !chrome.scripting?.getRegisteredContentScripts) return

  const scripts = await chrome.scripting.getRegisteredContentScripts({ ids: [MAIN_WORLD_SCRIPT_ID] })
  if (scripts.length === 0) {
    console.warn("Main-world observer script was not registered by Plasmo")
  }
}

ensureMainWorldObserverRegistered().catch((error: unknown) => console.warn("Failed to verify main-world observer", error))

browser.runtime.onInstalled.addListener(() => {
  installDynamicBlockRules().catch((error: unknown) => console.warn("Failed to install DNR rules", error))
  ensureMainWorldObserverRegistered().catch((error: unknown) => console.warn("Failed to verify main-world observer", error))
})

browser.tabs.onRemoved.addListener((tabId) => {
  summaries.delete(tabId)
  persistSummaries().catch(() => undefined)
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

      const current = readSummary(event.tabId, event.origin)
      summaries.set(event.tabId, upsertEvent(current, event, settings.maxEventsPerTab))
      await persistSummaries()
      return { ok: true }
    }

    if (message.type === "GET_SITE_SUMMARY") {
      return { type: "SITE_SUMMARY", payload: readSummary(message.tabId) }
    }

    if (message.type === "REFRESH_TAB_SCAN") {
      const summary = { ...readSummary(message.tabId), updatedAt: Date.now() }
      summaries.set(message.tabId, summary)
      await persistSummaries()
      return { type: "SITE_SUMMARY", payload: summary }
    }

    if (message.type === "UPDATE_SETTINGS") {
      settings = { ...settings, ...message.payload }
      await persistSettings()
      return { ok: true, payload: settings }
    }

    if (message.type === "CLEAR_LOCAL_DATA") {
      await clearLocalData()
      return { ok: true }
    }

    return { ok: false, error: "unhandled_message" }
  })()
})