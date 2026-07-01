import { resolveBlockabilityStatus } from "~core/domain/status"
import type { ObserverEvent } from "~core/domain/types"

function emit(event: Omit<ObserverEvent, "tabId">) {
  chrome.runtime.sendMessage({ type: "OBSERVED_EVENT", payload: { ...event, tabId: -1 } }).catch(() => undefined)
}

function observeCanvasReads() {
  const original = HTMLCanvasElement.prototype.toDataURL

  HTMLCanvasElement.prototype.toDataURL = function patchedToDataURL(...args) {
    const status = resolveBlockabilityStatus("content_mitigatable", { mitigated: false })

    emit({
      id: crypto.randomUUID(),
      origin: location.origin,
      observedAt: Date.now(),
      source: "api-hook",
      firstParty: true,
      policyLabel: "fingerprinting",
      eventType: "canvas_read",
      blockability: "content_mitigatable",
      status,
      confidence: "probable",
      evidence: ["HTMLCanvasElement.toDataURL was called by page script."]
    })

    return original.apply(this, args)
  }
}

observeCanvasReads()