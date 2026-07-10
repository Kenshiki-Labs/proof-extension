import { RuntimeMessageSchema } from "~core/contracts/messages"
import browser from "webextension-polyfill"
import type { PlasmoCSConfig } from "plasmo"

import { ObserverEventSchema, PageErrorSchema } from "~core/contracts/schemas"
import { collectBrowserSurfaceExposure } from "~core/signals/browser-surface"
import type { ObserverEvent } from "~core/domain/types"

const PAGE_EVENT_TYPE = "proof-extension:observer-event"
const PAGE_ERROR_EVENT_TYPE = "proof-extension:page-error"
const SEEN_EVENT_TTL_MS = 10_000
const SEEN_PAGE_ERROR_TTL_MS = 10_000
const MAX_FORWARDED_PAGE_ERRORS = 5

const seenEventIds = new Map<string, number>()
const seenPageErrors = new Map<string, number>()
let forwardedPageErrors = 0

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
  // Keyed on id + timestamp, not id alone: the main-world observer delivers
  // each payload over multiple channels (CustomEvent plus postMessage), which
  // must collapse to one — but event ids are deterministic per signal, so a
  // genuine repeat of the same observation arrives with a new observedAt and
  // must still pass through to be counted.
  const deliveryKey = `${event.id}|${event.observedAt}`
  if (seenEventIds.has(deliveryKey)) return

  seenEventIds.set(deliveryKey, now + SEEN_EVENT_TTL_MS)
  browser.runtime.sendMessage({ type: "OBSERVED_EVENT", payload: { ...event, tabId: -1 } }).catch(() => undefined)
}

// Payloads arriving over the page channel come from the MAIN world, where
// any page script can post them — evidence integrity requires treating them
// as untrusted. Enforce shape, pin the origin to this document, and reject
// claims only privileged contexts may make (network evidence, blocked
// status) before anything reaches the background.
function forwardPageEvent(payload: unknown) {
  const parsed = ObserverEventSchema.safeParse({ ...(payload as object), tabId: -1 })
  if (!parsed.success) return

  const event = parsed.data as ObserverEvent
  if (event.origin !== location.origin) return
  if (event.source === "network") return
  if (event.source === "extension-scan") return
  if (event.status === "blocked") return

  emit(event)
}

function pruneSeenPageErrors(now: number) {
  for (const [fingerprint, expiresAt] of seenPageErrors.entries()) {
    if (expiresAt <= now) seenPageErrors.delete(fingerprint)
  }
}

function forwardPageError(payload: unknown) {
  if (forwardedPageErrors >= MAX_FORWARDED_PAGE_ERRORS) return

  const parsed = PageErrorSchema.omit({ id: true }).safeParse(payload)
  if (!parsed.success) return

  const now = Date.now()
  if (Math.abs(parsed.data.observedAt - now) > 60_000) return

  pruneSeenPageErrors(now)
  const fingerprint = [parsed.data.message, parsed.data.stackPreview ?? ""].join("|")
  if (seenPageErrors.has(fingerprint)) return

  seenPageErrors.set(fingerprint, now + SEEN_PAGE_ERROR_TTL_MS)
  forwardedPageErrors += 1
  browser.runtime.sendMessage({ type: "PAGE_ERROR_OBSERVED", payload: parsed.data }).catch(() => undefined)
}

function emitBridgeReady() {
  emit({
    id: `content_bridge:${location.origin}`,
    origin: location.origin,
    observedAt: Date.now(),
    source: "content",
    firstParty: true,
    policyLabel: "unknown_first_party",
    eventType: "extension_diagnostic",
    blockability: "observable_only",
    status: "active",
    confidence: "confirmed",
    evidence: ["Proof isolated bridge is active on this page."]
  })
}

async function syncSettingsToPage() {
  // Content scripts get the narrow settings view only — full GET_SETTINGS is
  // reserved for extension pages by the router's sender gate.
  const response = await browser.runtime.sendMessage({ type: "GET_CONTENT_SCRIPT_SETTINGS" })
  const parsed = RuntimeMessageSchema.safeParse(response)
  if (!parsed.success || parsed.data.type !== "CONTENT_SCRIPT_SETTINGS") return

  document.documentElement.dataset.proofExtensionMitigateCanvas = String(parsed.data.payload.mitigateCanvas)
  for (const event of collectBrowserSurfaceExposure(location.origin)) emit(event)
}

syncSettingsToPage().catch(() => undefined)
emitBridgeReady()

window.addEventListener("message", (message) => {
  if (message.source !== window) return

  if (message.data?.type === PAGE_EVENT_TYPE) {
    forwardPageEvent(message.data.payload)
    return
  }

  if (message.data?.type === PAGE_ERROR_EVENT_TYPE) {
    forwardPageError(message.data.payload)
  }
})

document.addEventListener(PAGE_EVENT_TYPE, (event) => {
  if (!(event instanceof CustomEvent)) return
  forwardPageEvent(event.detail)
})

// Dynamic script injection after page load (spec: must-detect). Observation
// starts at DOMContentLoaded on purpose: parser-inserted scripts are the
// page loading itself, and MutationObserver cannot distinguish them from
// injected ones during parse — claiming "injected after page load" for them
// would be false evidence. The background joins the src against the tracker
// DB, so known vendors get named; unknown ones stay unattributed.
function observeScriptInsertions() {
  const watch = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLScriptElement) || !node.src) continue

        let scriptOrigin: string
        try {
          scriptOrigin = new URL(node.src, location.href).origin
        } catch {
          continue
        }

        const firstParty = scriptOrigin === location.origin
        emit({
          id: `dom_script:${location.origin}:${scriptOrigin}`,
          origin: location.origin,
          observedAt: Date.now(),
          source: "content",
          firstParty,
          ...(firstParty ? { policyLabel: "unknown_first_party" as const } : {}),
          eventType: "script_injected",
          blockability: "observable_only",
          status: "active",
          confidence: "confirmed",
          evidence: [`Script inserted after page load from ${scriptOrigin}.`],
          details: { src: node.src }
        })
      }
    }
  })

  watch.observe(document.documentElement, { childList: true, subtree: true })
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", observeScriptInsertions, { once: true })
} else {
  observeScriptInsertions()
}