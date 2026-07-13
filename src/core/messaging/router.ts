import browser from "webextension-polyfill"
import type { Runtime } from "webextension-polyfill"

import { projectContentScriptSettings } from "~core/contracts/content-settings"
import { RuntimeMessageSchema } from "~core/contracts/messages"
import { stripPageSuppliedAttribution, untrustedObservedEventReason } from "~core/domain/message-guards"
import type {
  ObserverEvent,
  PageError,
  RollingValuationSummary,
  RuntimeMessage,
  SiteSummary,
  UserSettings,
  ValuationPeriod
} from "~core/domain/types"

// background.ts owns all mutable worker state; the router only parses,
// authenticates the sender, and dispatches to these injected handlers.
export type RuntimeMessageRouterDeps = {
  ensureHydrated: () => Promise<void>
  recordObservedEvent: (event: ObserverEvent) => Promise<void>
  recordPageError: (tabId: number, origin: string, error: PageError) => void
  readSummary: (tabId: number) => SiteSummary
  hasCookieMetadataPermission: () => Promise<boolean>
  requestCookieMetadataPermission: () => Promise<boolean>
  scanCookieMetadataForTab: (tabId: number) => Promise<RuntimeMessage>
  inspectCookieValuesForTab: (tabId: number) => Promise<RuntimeMessage>
  rollupValuation: (period: ValuationPeriod) => RollingValuationSummary
  refreshTabScan: (tabId: number) => Promise<SiteSummary>
  runConsentAuditForTab: (tabId: number) => Promise<RuntimeMessage>
  generateAiAuditReport: (payload: { auditPayload: string; tabId: number }) => Promise<RuntimeMessage>
  getSettings: () => UserSettings
  updateSettings: (payload: Partial<UserSettings>) => Promise<UserSettings>
  clearValuationLedger: () => Promise<void>
  clearLocalData: () => Promise<void>
}

function senderOrigin(sender: Runtime.MessageSender) {
  const url = sender.url ?? sender.tab?.url
  if (!url) return null
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

function originMatchesSender(event: ObserverEvent, sender: Runtime.MessageSender) {
  const origin = senderOrigin(sender)
  return !origin || origin === event.origin
}

// Extension pages (popup, options, the report tab) load from the extension's
// own origin; content scripts report the web page's URL. The report page opens
// in a normal tab, so sender.tab presence cannot be the discriminator — the
// sender URL's origin is.
const EXTENSION_ORIGIN = browser.runtime.getURL("")

function isExtensionPageSender(sender: Runtime.MessageSender) {
  return typeof sender.url === "string" && sender.url.startsWith(EXTENSION_ORIGIN)
}

export function createRuntimeMessageRouter(deps: RuntimeMessageRouterDeps) {
  return (rawMessage: unknown, sender: Runtime.MessageSender) => {
    const parsedMessage = RuntimeMessageSchema.safeParse(rawMessage)
    if (!parsedMessage.success) return Promise.resolve({ ok: false, error: "invalid_message" })

    const message = parsedMessage.data as RuntimeMessage

    return (async () => {
      await deps.ensureHydrated()

      if (message.type === "OBSERVED_EVENT") {
        // tabId comes from the authenticated sender, not the payload, so a
        // page cannot target another tab. Attribution is stripped before any
        // downstream handling — the background is the only authority on which
        // company an observation names.
        const event = stripPageSuppliedAttribution({
          ...message.payload,
          tabId: sender.tab?.id ?? message.payload.tabId
        } as ObserverEvent)
        if (!originMatchesSender(event, sender)) return { ok: false, error: "origin_mismatch" }

        const untrustedReason = untrustedObservedEventReason(event)
        if (untrustedReason) return { ok: false, error: untrustedReason }

        await deps.recordObservedEvent(event)
        return { ok: true }
      }

      if (message.type === "PAGE_ERROR_OBSERVED") {
        const tabId = sender.tab?.id
        if (tabId === undefined) return { ok: false, error: "no_tab_id" }

        const pageError: PageError = { id: crypto.randomUUID(), ...message.payload }
        deps.recordPageError(tabId, senderOrigin(sender) ?? "unknown", pageError)
        return { ok: true }
      }

      // The content script syncs mitigation flags into the page and gates its
      // exposure scan on the answer. It gets exactly that — not full settings:
      // blockedTrackerIds and per-domain visit frequencies must not be
      // readable from arbitrary page contexts.
      if (message.type === "GET_CONTENT_SCRIPT_SETTINGS") {
        return { type: "CONTENT_SCRIPT_SETTINGS", payload: projectContentScriptSettings(deps.getSettings()) }
      }

      // The blocked-space marker asks one question: "did this extension block
      // anything on my tab?" A bare boolean, derived from the sender's own
      // tab — never which trackers, never another tab's state — so an
      // arbitrary page context learns nothing it couldn't infer itself.
      if (message.type === "GET_BLOCK_MARKER_STATE") {
        const tabId = sender.tab?.id
        const active = tabId !== undefined && deps.readSummary(tabId).blockedCompanies.length > 0
        return { type: "BLOCK_MARKER_STATE", payload: { active } }
      }

      // Everything below is a privileged operation reachable only from the
      // extension's own pages (popup, options, report tab). Content scripts run
      // inside every <all_urls> page context, so a compromised page context
      // must never be able to wipe local data, rewrite settings, or trigger
      // scans — the three message types above are the whole content-script API.
      if (!isExtensionPageSender(sender)) return { ok: false, error: "unauthorized_sender" }

      if (message.type === "GET_SITE_SUMMARY") {
        return { type: "SITE_SUMMARY", payload: deps.readSummary(message.tabId) }
      }

      if (message.type === "GET_COOKIE_METADATA_PERMISSION") {
        return { type: "COOKIE_METADATA_PERMISSION", granted: await deps.hasCookieMetadataPermission() }
      }

      if (message.type === "REQUEST_COOKIE_METADATA_PERMISSION") {
        return { type: "COOKIE_METADATA_PERMISSION", granted: await deps.requestCookieMetadataPermission() }
      }

      if (message.type === "SCAN_SITE_COOKIES") {
        return deps.scanCookieMetadataForTab(message.tabId)
      }

      if (message.type === "INSPECT_SITE_COOKIE_VALUES") {
        return deps.inspectCookieValuesForTab(message.tabId)
      }

      if (message.type === "GET_VALUATION_ROLLUP") {
        return { type: "VALUATION_ROLLUP", payload: deps.rollupValuation(message.period) }
      }

      if (message.type === "REFRESH_TAB_SCAN") {
        return { type: "SITE_SUMMARY", payload: await deps.refreshTabScan(message.tabId) }
      }

      if (message.type === "RUN_CONSENT_AUDIT") {
        return deps.runConsentAuditForTab(message.tabId)
      }

      if (message.type === "GENERATE_AI_AUDIT_REPORT") {
        return deps.generateAiAuditReport(message.payload)
      }

      if (message.type === "GET_SETTINGS") {
        return { type: "SETTINGS", payload: deps.getSettings() }
      }

      if (message.type === "UPDATE_SETTINGS") {
        return { ok: true, payload: await deps.updateSettings(message.payload) }
      }

      if (message.type === "CLEAR_VALUATION_LEDGER") {
        await deps.clearValuationLedger()
        return { ok: true }
      }

      if (message.type === "CLEAR_LOCAL_DATA") {
        await deps.clearLocalData()
        return { ok: true }
      }

      return { ok: false, error: "unhandled_message" }
    })()
  }
}
