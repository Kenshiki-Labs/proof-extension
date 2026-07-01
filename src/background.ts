import { createEmptySiteSummary, upsertEvent } from "~core/state/summaries"
import type { ObserverEvent, RuntimeMessage, SiteSummary } from "~core/domain/types"

const summaries = new Map<number, SiteSummary>()

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  if (message.type === "OBSERVED_EVENT") {
    const event = { ...message.payload, tabId: _sender.tab?.id ?? message.payload.tabId } as ObserverEvent
    const current = summaries.get(event.tabId) ?? createEmptySiteSummary(event.origin, event.tabId)
    summaries.set(event.tabId, upsertEvent(current, event))
    sendResponse({ ok: true })
    return true
  }

  if (message.type === "GET_SITE_SUMMARY") {
    const summary = summaries.get(message.tabId) ?? createEmptySiteSummary("unknown", message.tabId)
    sendResponse({ type: "SITE_SUMMARY", payload: summary })
    return true
  }

  return false
})