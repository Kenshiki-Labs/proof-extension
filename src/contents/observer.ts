import browser from "webextension-polyfill"
import type { PlasmoCSConfig } from "plasmo"

import { RuntimeMessageSchema } from "~core/contracts/schemas"
import type { ObserverEvent } from "~core/domain/types"

const PAGE_EVENT_TYPE = "proof-extension:observer-event"
const PAGE_ERROR_EVENT_TYPE = "proof-extension:page-error"
const SEEN_EVENT_TTL_MS = 10_000

const seenEventIds = new Map<string, number>()

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_start"
}

function pruneSeenEventIds(now: number) {
  for (const [id, expiresAt] of seenEventIds.entries()) {
    if (expiresAt <= now) seenEventIds.delete(id)
  }
}

function emit(event: Omit<ObserverEvent, "tabId">) {
  const now = Date.now()
  pruneSeenEventIds(now)
  if (seenEventIds.has(event.id)) return

  seenEventIds.set(event.id, now + SEEN_EVENT_TTL_MS)
  browser.runtime.sendMessage({ type: "OBSERVED_EVENT", payload: { ...event, tabId: -1 } }).catch(() => undefined)
}

function emitBridgeReady() {
  emit({
    id: `content_bridge:${location.origin}`,
    origin: location.origin,
    observedAt: Date.now(),
    source: "content",
    firstParty: true,
    policyLabel: "unknown_first_party",
    eventType: "script_injected",
    blockability: "observable_only",
    status: "active",
    confidence: "confirmed",
    evidence: ["Proof isolated bridge is active on this page."]
  })
}

async function syncSettingsToPage() {
  const response = await browser.runtime.sendMessage({ type: "GET_SETTINGS" })
  const parsed = RuntimeMessageSchema.safeParse(response)
  if (!parsed.success || parsed.data.type !== "SETTINGS") return

  document.documentElement.dataset.proofExtensionMitigateCanvas = String(parsed.data.payload.mitigateCanvas)
}

syncSettingsToPage().catch(() => undefined)
emitBridgeReady()

window.addEventListener("message", (message) => {
  if (message.source !== window) return

  if (message.data?.type === PAGE_EVENT_TYPE) {
    emit(message.data.payload)
    return
  }

  if (message.data?.type === PAGE_ERROR_EVENT_TYPE) {
    browser.runtime.sendMessage({ type: "PAGE_ERROR_OBSERVED", payload: message.data.payload }).catch(() => undefined)
  }
})

document.addEventListener(PAGE_EVENT_TYPE, (event) => {
  if (!(event instanceof CustomEvent)) return
  emit(event.detail)
})