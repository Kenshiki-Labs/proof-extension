import browser from "webextension-polyfill"
import type { PlasmoCSConfig } from "plasmo"

import type { ObserverEvent } from "~core/domain/types"

const PAGE_EVENT_TYPE = "proof-extension:observer-event"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_start"
}

function emit(event: Omit<ObserverEvent, "tabId">) {
  browser.runtime.sendMessage({ type: "OBSERVED_EVENT", payload: { ...event, tabId: -1 } }).catch(() => undefined)
}

window.addEventListener("message", (message) => {
  if (message.source !== window) return
  if (message.data?.type !== PAGE_EVENT_TYPE) return

  emit(message.data.payload)
})

document.addEventListener(PAGE_EVENT_TYPE, (event) => {
  if (!(event instanceof CustomEvent)) return
  emit(event.detail)
})