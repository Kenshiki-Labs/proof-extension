import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_start",
  world: "MAIN"
}

const PAGE_EVENT_TYPE = "proof-extension:observer-event"

function randomId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function emitCanvasRead(evidence: string) {
  const message = {
    type: PAGE_EVENT_TYPE,
    payload: {
      id: randomId(),
      origin: location.origin,
      observedAt: Date.now(),
      source: "api-hook",
      firstParty: true,
      policyLabel: "fingerprinting",
      eventType: "canvas_read",
      blockability: "content_mitigatable",
      status: "active",
      confidence: "probable",
      evidence: [evidence]
    }
  }

  document.dispatchEvent(new CustomEvent(PAGE_EVENT_TYPE, { detail: message.payload }))
  window.postMessage(message, location.origin)
  setTimeout(() => window.postMessage(message, location.origin), 0)
}

function observeCanvasReads() {
  const originalToDataURL = HTMLCanvasElement.prototype.toDataURL
  HTMLCanvasElement.prototype.toDataURL = function patchedToDataURL(...args) {
    emitCanvasRead("HTMLCanvasElement.toDataURL was called by page script in the main world.")
    return originalToDataURL.apply(this, args)
  }

  const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData
  CanvasRenderingContext2D.prototype.getImageData = function patchedGetImageData(...args) {
    emitCanvasRead("CanvasRenderingContext2D.getImageData was called by page script in the main world.")
    return originalGetImageData.apply(this, args)
  }
}

observeCanvasReads()