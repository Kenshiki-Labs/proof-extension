import type { PlasmoCSConfig } from "plasmo"

import { createNoiseSeed, installCanvasElementReadHooks } from "~core/content/canvas-hooks"
import { installIdentityDigestHook } from "~core/content/identity-digest-hooks"
import { installPersistenceHooks } from "~core/content/persistence-hooks"
import { isIgnoredPageError } from "~core/domain/page-errors"
import { consentSignalGlobalNames } from "~core/signals/consent-signals"
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

// Every MAIN-world observation shares the same invariant frame: an api-hook
// read of the first party, stamped with the page origin and the read time.
// The MAIN world only ever asserts CLAIMS — the privileged side rebuilds
// evidence and owns attribution — so fixing that frame in one place keeps the
// contract visible and stops the six observers below from drifting apart.
type ApiHookPayloadFields = {
  id: string
  eventType: string
  policyLabel: string
  blockability: string
  status: string
  confidence: string
  evidence: string[]
  details?: Record<string, string | number>
}

function makeApiHookPayload(fields: ApiHookPayloadFields) {
  const payload: Record<string, unknown> = {
    id: fields.id,
    origin: location.origin,
    observedAt: Date.now(),
    source: "api-hook",
    firstParty: true,
    policyLabel: fields.policyLabel,
    eventType: fields.eventType,
    blockability: fields.blockability,
    status: fields.status,
    confidence: fields.confidence,
    evidence: fields.evidence
  }
  if (fields.details !== undefined) payload.details = fields.details
  return payload
}

function postApiHookEvent(fields: ApiHookPayloadFields) {
  window.postMessage({ type: PAGE_EVENT_TYPE, payload: makeApiHookPayload(fields) }, location.origin)
}

function emitObserverReady() {
  const payload = makeApiHookPayload({
    id: `observer_ready:${location.origin}`,
    policyLabel: "unknown_first_party",
    eventType: "extension_diagnostic",
    blockability: "observable_only",
    status: "active",
    confidence: "confirmed",
    evidence: ["Proof main-world observer installed page API hooks."]
  })

  document.dispatchEvent(new CustomEvent(PAGE_EVENT_TYPE, { detail: payload }))
  window.postMessage({ type: PAGE_EVENT_TYPE, payload }, location.origin)
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
    postApiHookEvent({
      id: `sdk_global:${location.origin}:${globalName}`,
      policyLabel: "unknown_first_party",
      eventType: "sdk_detected",
      blockability: "network_blockable",
      status: "active",
      confidence: "weak",
      evidence: [`Global variable ${globalName} was present in the page.`],
      details: { global: globalName }
    })
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

function scanConsentSignals(reportedGlobals: Set<string>) {
  for (const globalName of consentSignalGlobalNames()) {
    if (reportedGlobals.has(globalName)) continue
    if ((window as unknown as Record<string, unknown>)[globalName] === undefined) continue

    reportedGlobals.add(globalName)
    postApiHookEvent({
      id: `consent_signal:${location.origin}:${globalName}`,
      policyLabel: "unknown_first_party",
      eventType: "consent_signal_observed",
      blockability: "observable_only",
      status: "active",
      confidence: "weak",
      evidence: [`Consent signal global ${globalName} was present in the page.`],
      details: { global: globalName }
    })
  }
}

function observeConsentSignals() {
  const reportedGlobals = new Set<string>()
  const scan = () => scanConsentSignals(reportedGlobals)

  scan()
  if (document.readyState === "complete") scan()
  else window.addEventListener("load", scan, { once: true })
  setTimeout(scan, 2_500)
}

observeConsentSignals()

function observeIdentityDigests() {
  const send = createRateLimitedReporter<{ details: Record<string, string | number> }>((id, { details }) => {
    postApiHookEvent({
      id,
      policyLabel: "behavioral_profiling",
      eventType: "identity_digest_observed",
      blockability: "observable_only",
      status: "active",
      confidence: "weak",
      evidence: ["Reported by the identity digest observer; evidence is rebuilt by the extension before recording."],
      details
    })
  })

  installIdentityDigestHook(({ key, details }) => {
    send(`identity_digest:${location.origin}:${key}`, { details })
  })
}

observeIdentityDigests()

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
    postApiHookEvent({
      id,
      policyLabel: "unknown_first_party",
      eventType,
      blockability: "observable_only",
      status: "active",
      confidence: "confirmed",
      evidence: ["Reported by the persistence observer; evidence is rebuilt by the extension before recording."],
      details
    })
  })

  installPersistenceHooks(({ eventType, key, details }) => {
    send(`${eventType}:${location.origin}:${key}`, { eventType, details })
  })
}

observePersistenceSurfaces()

// Canvas readback observation, plus opt-in mitigation. The hooks install at
// document_start unconditionally (observation is default-on like the
// persistence hooks), but noise is applied only while the isolated bridge
// has synced mitigateCanvas=true into the dataset flag — checked at call
// time, so no reinstall is ever needed. The bridge syncs once per page
// load, so a settings change applies to pages loaded after it. The
// payload's status is a claim; the background refuses "mitigated" unless
// the setting is actually on (core/signals/canvas-read.ts).
function observeCanvasReads() {
  const mitigationEnabled = () => document.documentElement.dataset.proofExtensionMitigateCanvas === "true"

  const send = createRateLimitedReporter<{ mitigated: boolean; details: Record<string, string | number> }>(
    (id, { mitigated, details }) => {
      postApiHookEvent({
        id,
        policyLabel: "unknown_first_party",
        eventType: "canvas_read",
        blockability: "content_mitigatable",
        status: mitigated ? "mitigated" : "active",
        confidence: "confirmed",
        evidence: ["Reported by the canvas observer; evidence is rebuilt by the extension before recording."],
        details
      })
    }
  )

  installCanvasElementReadHooks(
    ({ api, mitigated, details }) => send(`canvas_read:${location.origin}:${api}`, { mitigated, details }),
    mitigationEnabled,
    createNoiseSeed()
  )
}

observeCanvasReads()

// Global Privacy Control, JS half. The Sec-GPC request header (the legally
// meaningful half under CCPA) is emitted by a DNR rule in the background;
// this exposes navigator.globalPrivacyControl to page scripts that check it.
// Deliberately narrow:
// - never defined until the user's opt-in flag has actually been seen true,
//   so installing the extension changes nothing a site can read
// - never defined when the browser already implements GPC natively
//   (Firefox) — the browser's own signal stays authoritative
// - the getter reads the synced flag rather than a captured constant; the
//   bridge syncs once per page load, so a settings change applies to pages
//   loaded after it
function installGpcSignal() {
  if ("globalPrivacyControl" in navigator) return

  const enabled = () => document.documentElement.dataset.proofExtensionGpc === "true"
  let defined = false

  const observer = new MutationObserver(() => defineIfEnabled())

  function defineIfEnabled() {
    if (defined || !enabled()) return
    defined = true
    // Once defined the getter reads the live flag, so the observer's job is
    // done — disconnect it rather than watch the attribute for the life of
    // the frame.
    observer.disconnect()
    try {
      Object.defineProperty(Navigator.prototype, "globalPrivacyControl", {
        configurable: true,
        // Non-enumerable, matching every native Navigator accessor: an
        // enumerable property would let a page distinguish this injected
        // signal from a browser-native GPC and so fingerprint the extension.
        enumerable: false,
        get() {
          return document.documentElement.dataset.proofExtensionGpc === "true"
        }
      })
    } catch {
      /* a page that froze Navigator.prototype simply keeps no JS signal */
    }
  }

  defineIfEnabled()
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-proof-extension-gpc"]
  })
}

installGpcSignal()

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