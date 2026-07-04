import type { PlasmoCSConfig } from "plasmo"

import { installPersistenceHooks } from "~core/content/persistence-hooks"
import { isIgnoredPageError } from "~core/domain/page-errors"
import { createRateLimitedReporter } from "~core/signals/persistence"
import { sdkGlobalNames } from "~core/signals/sdk-globals"

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

// Vendor SDK globals (window.fbq, window.FS, …) are only visible from the
// MAIN world. This scan reports the raw fact — "this global name exists" —
// and nothing else; the privileged side owns the vendor join, so a hostile
// page can at most claim a global name, never its own attribution. Checked
// after load and again shortly after, because SDKs attach asynchronously.
function scanSdkGlobals(reportedGlobals: Set<string>) {
  for (const globalName of sdkGlobalNames()) {
    if (reportedGlobals.has(globalName)) continue
    if ((window as unknown as Record<string, unknown>)[globalName] === undefined) continue

    reportedGlobals.add(globalName)
    const payload = {
      id: `sdk_global:${location.origin}:${globalName}`,
      origin: location.origin,
      observedAt: Date.now(),
      source: "api-hook",
      firstParty: true,
      policyLabel: "unknown_first_party",
      eventType: "sdk_detected",
      blockability: "network_blockable",
      status: "active",
      confidence: "weak",
      evidence: [`Global variable ${globalName} was present in the page.`],
      details: { global: globalName }
    }
    window.postMessage({ type: PAGE_EVENT_TYPE, payload }, location.origin)
  }
}

function observeSdkGlobals() {
  const reportedGlobals = new Set<string>()
  const scan = () => scanSdkGlobals(reportedGlobals)

  if (document.readyState === "complete") scan()
  else window.addEventListener("load", scan, { once: true })
  // Late passes for SDKs that finish initializing after the load event.
  setTimeout(scan, 2_500)
  setTimeout(scan, 7_500)
}

observeSdkGlobals()

// Persistence-surface observation (cookies, Web Storage, IndexedDB, Cache
// API, service workers). The MAIN world reports bare metadata only — names,
// sizes, timing, never values — and the privileged side re-redacts and
// rebuilds evidence before anything is stored (normalizePersistenceEvent),
// so this channel carries claims, not evidence. Rate-limited so a page
// writing storage in a loop cannot become a message storm; repeats of the
// same deterministic id merge into a count in the background.
function observePersistenceSurfaces() {
  type PersistencePayload = { eventType: string; details: Record<string, string | number> }

  const send = createRateLimitedReporter<PersistencePayload>((id, { eventType, details }) => {
    const payload = {
      id,
      origin: location.origin,
      observedAt: Date.now(),
      source: "api-hook",
      firstParty: true,
      policyLabel: "unknown_first_party",
      eventType,
      blockability: "observable_only",
      status: "active",
      confidence: "confirmed",
      evidence: ["Reported by the persistence observer; evidence is rebuilt by the extension before recording."],
      details
    }
    window.postMessage({ type: PAGE_EVENT_TYPE, payload }, location.origin)
  })

  installPersistenceHooks(({ eventType, key, details }) => {
    send(`${eventType}:${location.origin}:${key}`, { eventType, details })
  })
}

observePersistenceSurfaces()

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