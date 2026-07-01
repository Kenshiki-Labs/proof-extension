import browser from "webextension-polyfill"
import type { Runtime } from "webextension-polyfill"

import { RuntimeMessageSchema } from "~core/contracts/schemas"
import { createEmptySiteSummary, upsertEvent } from "~core/state/summaries"
import type { ObserverEvent, RuntimeMessage, SiteSummary } from "~core/domain/types"

const summaries = new Map<number, SiteSummary>()

browser.runtime.onMessage.addListener((rawMessage: unknown, sender: Runtime.MessageSender) => {
  const parsedMessage = RuntimeMessageSchema.safeParse(rawMessage)
  if (!parsedMessage.success) return Promise.resolve({ ok: false, error: "invalid_message" })

  const message = parsedMessage.data as RuntimeMessage

  if (message.type === "OBSERVED_EVENT") {
    const event = { ...message.payload, tabId: sender.tab?.id ?? message.payload.tabId } as ObserverEvent
    const current = summaries.get(event.tabId) ?? createEmptySiteSummary(event.origin, event.tabId)
    summaries.set(event.tabId, upsertEvent(current, event))
    return Promise.resolve({ ok: true })
  }

  if (message.type === "GET_SITE_SUMMARY") {
    const summary = summaries.get(message.tabId) ?? createEmptySiteSummary("unknown", message.tabId)
    return Promise.resolve({ type: "SITE_SUMMARY", payload: summary })
  }

  return false
})