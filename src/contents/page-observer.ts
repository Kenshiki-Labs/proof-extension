import type { PlasmoCSConfig } from "plasmo"

import { isIgnoredPageError } from "~core/domain/page-errors"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_start",
  world: "MAIN"
}

const PAGE_EVENT_TYPE = "proof-extension:observer-event"
const PAGE_ERROR_EVENT_TYPE = "proof-extension:page-error"
const MAX_PAGE_ERRORS_REPORTED = 5

function emitObserverReady() {
  const message = {
    type: PAGE_EVENT_TYPE,
    payload: {
      id: `observer_ready:${location.origin}`,
      origin: location.origin,
      observedAt: Date.now(),
      source: "api-hook",
      firstParty: true,
      policyLabel: "unknown_first_party",
      eventType: "extension_diagnostic",
      blockability: "observable_only",
      status: "active",
      confidence: "confirmed",
      evidence: ["Proof main-world observer installed page API hooks."]
    }
  }

  document.dispatchEvent(new CustomEvent(PAGE_EVENT_TYPE, { detail: message.payload }))
  window.postMessage(message, location.origin)
}

emitObserverReady()

// We cannot reliably know whether a given page error was caused by our own
// hooks or by a pre-existing bug in the page's own script (e.g. an anti-bot
// script's own fragility) — the point is to never stay silent about the
// possibility. Capture-phase listener so a page's own try/catch or
// window.onerror override further down the chain can't hide this from us.
function observePageErrors() {
  let reported = 0

  function reportError(message: string, stack: string | undefined) {
    if (isIgnoredPageError(message)) return
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
      // event.message alone is frequently empty or the generic "Script
      // error." for cross-origin scripts (CORP/CSP-restricted reporting) —
      // filename/line/col are still available and worth keeping even when
      // the message itself is useless.
      const location_ = event.filename ? ` (${event.filename}:${event.lineno}:${event.colno})` : ""
      const message = (event.message || "Uncaught error") + location_
      reportError(message, event.error?.stack)
    },
    true
  )

  // Deliberately no unhandledrejection listener. Our hooks are synchronous
  // API wrappers — breakage they cause surfaces as an uncaught exception on
  // the error channel above. Unhandled rejections are overwhelmingly the
  // page's own async plumbing (fetch timeouts, media player retries) and
  // were exhausting the small error budget with noise on ordinary sites.
}

observePageErrors()