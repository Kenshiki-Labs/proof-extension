import type { PlasmoCSConfig } from "plasmo"

import { makeLookNative } from "~lib/native-stealth"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_start",
  world: "MAIN"
}

const PAGE_EVENT_TYPE = "proof-extension:observer-event"

function canvasMitigationEnabled() {
  return document.documentElement.dataset.proofExtensionMitigateCanvas === "true"
}
const PAGE_ERROR_EVENT_TYPE = "proof-extension:page-error"
const MAX_PAGE_ERRORS_REPORTED = 5

function randomId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function emitCanvasRead(evidence: string, mitigated = false) {
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
      status: mitigated ? "mitigated" : "active",
      confidence: "probable",
      evidence: [evidence]
    }
  }

  document.dispatchEvent(new CustomEvent(PAGE_EVENT_TYPE, { detail: message.payload }))
  window.postMessage(message, location.origin)
  setTimeout(() => window.postMessage(message, location.origin), 0)
}

function emitObserverReady() {
  const message = {
    type: PAGE_EVENT_TYPE,
    payload: {
      id: `script_injected:${location.origin}`,
      origin: location.origin,
      observedAt: Date.now(),
      source: "api-hook",
      firstParty: true,
      policyLabel: "unknown_first_party",
      eventType: "script_injected",
      blockability: "observable_only",
      status: "active",
      confidence: "confirmed",
      evidence: ["Proof main-world observer installed page API hooks."]
    }
  }

  document.dispatchEvent(new CustomEvent(PAGE_EVENT_TYPE, { detail: message.payload }))
  window.postMessage(message, location.origin)
}

function observeCanvasReads() {
  const originalToDataURL = HTMLCanvasElement.prototype.toDataURL
  HTMLCanvasElement.prototype.toDataURL = makeLookNative(function toDataURL(
    this: HTMLCanvasElement,
    ...args: Parameters<typeof originalToDataURL>
  ) {
    if (canvasMitigationEnabled()) {
      emitCanvasRead("HTMLCanvasElement.toDataURL was called by page script and returned a blank canvas because canvas mitigation is enabled.", true)
      const blank = document.createElement("canvas")
      blank.width = this.width
      blank.height = this.height
      return originalToDataURL.apply(blank, args)
    }

    emitCanvasRead("HTMLCanvasElement.toDataURL was called by page script in the main world.")
    return originalToDataURL.apply(this, args)
  }, "toDataURL")

  const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData
  CanvasRenderingContext2D.prototype.getImageData = makeLookNative(function getImageData(
    this: CanvasRenderingContext2D,
    ...args: Parameters<typeof originalGetImageData>
  ) {
    if (canvasMitigationEnabled()) {
      emitCanvasRead("CanvasRenderingContext2D.getImageData was called by page script and returned blank pixels because canvas mitigation is enabled.", true)
      const [, , width, height] = args
      return new ImageData(width, height)
    }

    emitCanvasRead("CanvasRenderingContext2D.getImageData was called by page script in the main world.")
    return originalGetImageData.apply(this, args)
  }, "getImageData")
}

observeCanvasReads()
emitObserverReady()

// We cannot reliably know whether a given page error was caused by our own
// hooks or by a pre-existing bug in the page's own script (e.g. an anti-bot
// script's own fragility) — the point is to never stay silent about the
// possibility. Capture-phase listener so a page's own try/catch or
// window.onerror override further down the chain can't hide this from us.
function observePageErrors() {
  let reported = 0

  function reportError(message: string, stack: string | undefined) {
    if (reported >= MAX_PAGE_ERRORS_REPORTED) return
    reported += 1

    window.postMessage(
      {
        type: PAGE_ERROR_EVENT_TYPE,
        payload: {
          observedAt: Date.now(),
          message,
          stackPreview: stack?.slice(0, 500)
        }
      },
      location.origin
    )
  }

  window.addEventListener(
    "error",
    (event) => {
      reportError(event.message || "Uncaught error", event.error?.stack)
    },
    true
  )

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason
    const message = reason instanceof Error ? reason.message : String(reason)
    reportError(`Unhandled promise rejection: ${message}`, reason instanceof Error ? reason.stack : undefined)
  })
}

observePageErrors()