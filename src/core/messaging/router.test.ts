import { describe, expect, it, vi } from "vitest"
import type { Runtime } from "webextension-polyfill"

import type { ObserverEvent, RuntimeMessage, UserSettings } from "~core/domain/types"
import { createEmptySiteSummary } from "~core/state/summaries"
import { createRuntimeMessageRouter, type RuntimeMessageRouterDeps } from "./router"

vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: { getURL: (path: string) => `chrome-extension://test-extension-id/${path}` },
    tabs: { get: vi.fn() }
  }
}))

const EXTENSION_PAGE_SENDER: Runtime.MessageSender = { url: "chrome-extension://test-extension-id/popup.html" }
const WEB_PAGE_SENDER: Runtime.MessageSender = {
  url: "https://news.example/story",
  tab: { id: 7, url: "https://news.example/story" } as NonNullable<Runtime.MessageSender["tab"]>
}

const settings: UserSettings = {
  retentionDays: 30,
  maxEventsPerTab: 200,
  blockedTrackerIds: [],
  mitigateCanvas: false,
  mitigateAudio: false,
  mitigateWebgl: false,
  skipReportOpenConfirm: false,
  cookieMetadataEnabled: false,
  siteVisitFrequency: {}
}

const summary = createEmptySiteSummary("https://news.example", 7)
const scanResult: RuntimeMessage = { type: "COOKIE_METADATA_SCAN", payload: { status: "available", events: [] } }
const inspectResult: RuntimeMessage = { type: "COOKIE_VALUE_INSPECT", payload: { status: "available", cookies: [] } }
const consentResult: RuntimeMessage = { type: "CONSENT_AUDIT_FAILED", reason: "no_tab" }
const aiResult: RuntimeMessage = { type: "AI_AUDIT_REPORT", payload: { report: "report body" } }
const rollup = { period: "day", marker: true } as unknown as ReturnType<RuntimeMessageRouterDeps["rollupValuation"]>

function makeDeps() {
  return {
    ensureHydrated: vi.fn().mockResolvedValue(undefined),
    recordObservedEvent: vi.fn().mockResolvedValue(undefined),
    recordPageError: vi.fn(),
    readSummary: vi.fn().mockReturnValue(summary),
    hasCookieMetadataPermission: vi.fn().mockResolvedValue(true),
    requestCookieMetadataPermission: vi.fn().mockResolvedValue(false),
    scanCookieMetadataForTab: vi.fn().mockResolvedValue(scanResult),
    inspectCookieValuesForTab: vi.fn().mockResolvedValue(inspectResult),
    rollupValuation: vi.fn().mockReturnValue(rollup),
    refreshTabScan: vi.fn().mockResolvedValue(summary),
    runConsentAuditForTab: vi.fn().mockResolvedValue(consentResult),
    generateAiAuditReport: vi.fn().mockResolvedValue(aiResult),
    getSettings: vi.fn().mockReturnValue(settings),
    updateSettings: vi.fn().mockResolvedValue(settings),
    clearValuationLedger: vi.fn().mockResolvedValue(undefined),
    clearLocalData: vi.fn().mockResolvedValue(undefined)
  } satisfies RuntimeMessageRouterDeps
}

function trustedObservedEvent(overrides: Partial<ObserverEvent> = {}): ObserverEvent {
  return {
    id: "storage_write:1:news",
    tabId: 1,
    origin: "https://news.example",
    observedAt: 1_000,
    source: "content",
    firstParty: true,
    eventType: "storage_write",
    blockability: "content_mitigatable",
    status: "active",
    confidence: "probable",
    evidence: ["localStorage write observed"],
    ...overrides
  }
}

describe("createRuntimeMessageRouter", () => {
  it("rejects messages that do not parse as runtime messages", async () => {
    const deps = makeDeps()
    const route = createRuntimeMessageRouter(deps)

    await expect(route({ type: "NOT_A_MESSAGE" }, WEB_PAGE_SENDER)).resolves.toEqual({ ok: false, error: "invalid_message" })
    expect(deps.ensureHydrated).not.toHaveBeenCalled()
  })

  it("records an OBSERVED_EVENT from a content-script sender whose origin matches, pinning the sender's tab id", async () => {
    const deps = makeDeps()
    const route = createRuntimeMessageRouter(deps)

    await expect(route({ type: "OBSERVED_EVENT", payload: trustedObservedEvent() }, WEB_PAGE_SENDER)).resolves.toEqual({ ok: true })
    expect(deps.recordObservedEvent).toHaveBeenCalledWith(expect.objectContaining({ tabId: 7, origin: "https://news.example" }))
  })

  it("rejects an OBSERVED_EVENT whose origin does not match the sender", async () => {
    const deps = makeDeps()
    const route = createRuntimeMessageRouter(deps)
    const sender: Runtime.MessageSender = { url: "https://evil.example/page" }

    await expect(route({ type: "OBSERVED_EVENT", payload: trustedObservedEvent() }, sender)).resolves.toEqual({
      ok: false,
      error: "origin_mismatch"
    })
    expect(deps.recordObservedEvent).not.toHaveBeenCalled()
  })

  it("falls back to the sender tab URL when sender.url is absent, and accepts unknowable origins", async () => {
    const deps = makeDeps()
    const route = createRuntimeMessageRouter(deps)

    const tabOnlySender: Runtime.MessageSender = { tab: { id: 3, url: "https://news.example/a" } as NonNullable<Runtime.MessageSender["tab"]> }
    await expect(route({ type: "OBSERVED_EVENT", payload: trustedObservedEvent() }, tabOnlySender)).resolves.toEqual({ ok: true })

    // Unparseable sender URL: origin cannot be judged, so the event passes the origin gate.
    await expect(route({ type: "OBSERVED_EVENT", payload: trustedObservedEvent() }, { url: "not a url" })).resolves.toEqual({ ok: true })
    // No URL at all behaves the same.
    await expect(route({ type: "OBSERVED_EVENT", payload: trustedObservedEvent() }, {})).resolves.toEqual({ ok: true })
  })

  it("rejects OBSERVED_EVENTs that claim background-reserved provenance", async () => {
    const deps = makeDeps()
    const route = createRuntimeMessageRouter(deps)

    await expect(
      route({ type: "OBSERVED_EVENT", payload: trustedObservedEvent({ source: "network" }) }, WEB_PAGE_SENDER)
    ).resolves.toEqual({ ok: false, error: "network_source_reserved" })
    expect(deps.recordObservedEvent).not.toHaveBeenCalled()
  })

  it("records PAGE_ERROR_OBSERVED against the sender tab and rejects it without one", async () => {
    const deps = makeDeps()
    const route = createRuntimeMessageRouter(deps)
    const message = { type: "PAGE_ERROR_OBSERVED", payload: { observedAt: 1_000, message: "boom" } }

    await expect(route(message, WEB_PAGE_SENDER)).resolves.toEqual({ ok: true })
    expect(deps.recordPageError).toHaveBeenCalledWith(
      7,
      "https://news.example",
      expect.objectContaining({ id: expect.any(String), message: "boom" })
    )

    await expect(route(message, { url: "https://news.example/story" })).resolves.toEqual({ ok: false, error: "no_tab_id" })
  })

  it.each([
    { type: "GET_SITE_SUMMARY", tabId: 7 },
    { type: "GET_COOKIE_METADATA_PERMISSION" },
    { type: "REQUEST_COOKIE_METADATA_PERMISSION" },
    { type: "SCAN_SITE_COOKIES", tabId: 7 },
    { type: "INSPECT_SITE_COOKIE_VALUES", tabId: 7 },
    { type: "GET_VALUATION_ROLLUP", period: "day" },
    { type: "REFRESH_TAB_SCAN", tabId: 7 },
    { type: "RUN_CONSENT_AUDIT", tabId: 7 },
    { type: "GENERATE_AI_AUDIT_REPORT", payload: { tabId: 7, auditPayload: "payload" } },
    { type: "GET_SETTINGS" },
    { type: "UPDATE_SETTINGS", payload: { retentionDays: 10 } },
    { type: "CLEAR_VALUATION_LEDGER" },
    { type: "CLEAR_LOCAL_DATA" }
  ])("refuses privileged $type from a non-extension sender without invoking any handler", async (message) => {
    const deps = makeDeps()
    const route = createRuntimeMessageRouter(deps)

    await expect(route(message, WEB_PAGE_SENDER)).resolves.toEqual({ ok: false, error: "unauthorized_sender" })

    for (const [name, handler] of Object.entries(deps)) {
      if (name === "ensureHydrated") continue
      expect(handler).not.toHaveBeenCalled()
    }
  })

  it("serves GET_CONTENT_SCRIPT_SETTINGS to content-script senders with only the mitigation flag — never full settings", async () => {
    const deps = makeDeps()
    const route = createRuntimeMessageRouter(deps)

    const response = await route({ type: "GET_CONTENT_SCRIPT_SETTINGS" }, WEB_PAGE_SENDER)
    expect(response).toEqual({ type: "CONTENT_SCRIPT_SETTINGS", payload: { mitigateCanvas: settings.mitigateCanvas } })
    // The narrow view must not leak blockedTrackerIds or visit frequencies.
    expect(JSON.stringify(response)).not.toContain("blockedTrackerIds")
    expect(JSON.stringify(response)).not.toContain("siteVisitFrequency")
  })

  it("also refuses privileged messages when the sender has no URL at all", async () => {
    const deps = makeDeps()
    const route = createRuntimeMessageRouter(deps)

    await expect(route({ type: "GET_SETTINGS" }, {})).resolves.toEqual({ ok: false, error: "unauthorized_sender" })
  })

  it("dispatches privileged messages from extension pages to the injected handlers", async () => {
    const deps = makeDeps()
    const route = createRuntimeMessageRouter(deps)
    const send = (message: unknown) => route(message, EXTENSION_PAGE_SENDER)

    await expect(send({ type: "GET_SITE_SUMMARY", tabId: 7 })).resolves.toEqual({ type: "SITE_SUMMARY", payload: summary })
    expect(deps.readSummary).toHaveBeenCalledWith(7)

    await expect(send({ type: "GET_COOKIE_METADATA_PERMISSION" })).resolves.toEqual({ type: "COOKIE_METADATA_PERMISSION", granted: true })
    await expect(send({ type: "REQUEST_COOKIE_METADATA_PERMISSION" })).resolves.toEqual({
      type: "COOKIE_METADATA_PERMISSION",
      granted: false
    })

    await expect(send({ type: "SCAN_SITE_COOKIES", tabId: 7 })).resolves.toBe(scanResult)
    expect(deps.scanCookieMetadataForTab).toHaveBeenCalledWith(7)

    await expect(send({ type: "INSPECT_SITE_COOKIE_VALUES", tabId: 7 })).resolves.toBe(inspectResult)
    expect(deps.inspectCookieValuesForTab).toHaveBeenCalledWith(7)

    await expect(send({ type: "GET_VALUATION_ROLLUP", period: "day" })).resolves.toEqual({ type: "VALUATION_ROLLUP", payload: rollup })
    expect(deps.rollupValuation).toHaveBeenCalledWith("day")

    await expect(send({ type: "REFRESH_TAB_SCAN", tabId: 7 })).resolves.toEqual({ type: "SITE_SUMMARY", payload: summary })
    expect(deps.refreshTabScan).toHaveBeenCalledWith(7)

    await expect(send({ type: "RUN_CONSENT_AUDIT", tabId: 7 })).resolves.toBe(consentResult)
    expect(deps.runConsentAuditForTab).toHaveBeenCalledWith(7)

    await expect(send({ type: "GENERATE_AI_AUDIT_REPORT", payload: { tabId: 7, auditPayload: "payload" } })).resolves.toBe(aiResult)
    expect(deps.generateAiAuditReport).toHaveBeenCalledWith({ tabId: 7, auditPayload: "payload" })

    await expect(send({ type: "GET_SETTINGS" })).resolves.toEqual({ type: "SETTINGS", payload: settings })

    await expect(send({ type: "UPDATE_SETTINGS", payload: { retentionDays: 10 } })).resolves.toEqual({ ok: true, payload: settings })
    // Schema defaults (cookieMetadataEnabled, siteVisitFrequency) ride along after parsing.
    expect(deps.updateSettings).toHaveBeenCalledWith(expect.objectContaining({ retentionDays: 10 }))

    await expect(send({ type: "CLEAR_VALUATION_LEDGER" })).resolves.toEqual({ ok: true })
    expect(deps.clearValuationLedger).toHaveBeenCalled()

    await expect(send({ type: "CLEAR_LOCAL_DATA" })).resolves.toEqual({ ok: true })
    expect(deps.clearLocalData).toHaveBeenCalled()
  })

  it("returns unhandled_message for valid runtime messages with no background handler", async () => {
    const deps = makeDeps()
    const route = createRuntimeMessageRouter(deps)

    await expect(route({ type: "COOKIE_METADATA_PERMISSION", granted: true }, EXTENSION_PAGE_SENDER)).resolves.toEqual({
      ok: false,
      error: "unhandled_message"
    })
  })
})
