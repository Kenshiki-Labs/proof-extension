import { afterEach, describe, expect, it, vi } from "vitest"

import { installDynamicBlockRules, uninstallDynamicBlockRules } from "~core/db/dnr"
import { validateTrackerDatabase } from "~core/db/validate"
import type { ObserverEvent, SiteSummary } from "~core/domain/types"
import { createEmptySiteSummary } from "~core/state/summaries"
import { registerNetworkObserver, type NetworkObserverDeps } from "./observer"

const { trackers } = validateTrackerDatabase()

// vitest.setup's chrome stub predates the onErrorOccurred listener; the
// observer reads it with optional chaining, so add it for capture here.
const webRequestStub = chrome.webRequest as unknown as Record<string, { addListener: ReturnType<typeof vi.fn> } | undefined>
const onErrorOccurredStub = (webRequestStub.onErrorOccurred ??= { addListener: vi.fn() })

type SyntheticDetails = {
  frameId: number
  initiator?: string | undefined
  requestId: string
  tabId: number
  timeStamp: number
  type: string
  url: string
  requestHeaders?: { name: string; value?: string }[] | undefined
  responseHeaders?: { name: string; value?: string }[] | undefined
  error?: string | undefined
}

type CapturedListener = (details: SyntheticDetails) => void
type CapturedRuleListener = (info: { rule: { ruleId: number }; request: SyntheticDetails }) => void

function lastListener<T>(addListener: unknown): T {
  const listener = vi.mocked(addListener as (callback: T) => void).mock.calls.at(-1)?.[0]
  if (!listener) throw new Error("listener was not registered")
  return listener
}

function register(overrides: Partial<NetworkObserverDeps> = {}) {
  const summaries = new Map<number, SiteSummary>()
  const deps = {
    ensureHydrated: vi.fn().mockResolvedValue(undefined),
    recordEvent: vi.fn().mockResolvedValue(undefined),
    readTabSummary: vi.fn((tabId: number) => summaries.get(tabId)),
    writeTabSummary: vi.fn((tabId: number, summary: SiteSummary) => void summaries.set(tabId, summary)),
    scheduleSummaryWrite: vi.fn(),
    initialRuleSync: Promise.resolve() as Promise<unknown>,
    trackers,
    ...overrides
  }
  registerNetworkObserver(deps)
  return {
    deps,
    summaries,
    onBeforeRequest: lastListener<CapturedListener>(chrome.webRequest.onBeforeRequest.addListener),
    onBeforeSendHeaders: lastListener<CapturedListener>(chrome.webRequest.onBeforeSendHeaders.addListener),
    onHeadersReceived: lastListener<CapturedListener>(chrome.webRequest.onHeadersReceived.addListener),
    onErrorOccurred: lastListener<CapturedListener>(onErrorOccurredStub.addListener),
    onRuleMatchedDebug: lastListener<CapturedRuleListener>(chrome.declarativeNetRequest.onRuleMatchedDebug.addListener)
  }
}

function requestOf(overrides: Partial<SyntheticDetails> = {}): SyntheticDetails {
  return {
    frameId: 0,
    initiator: "https://news.example",
    requestId: "r1",
    tabId: 1,
    timeStamp: 1_000.4,
    type: "script",
    url: "https://cdn.unknown.example/collect.js",
    ...overrides
  }
}

function summaryWithEvents(events: ObserverEvent[]): SiteSummary {
  return { ...createEmptySiteSummary("https://news.example", 1), events }
}

function fullstoryEvent(overrides: Partial<ObserverEvent>): ObserverEvent {
  return {
    id: "request_seen:1:r9:fullstory",
    tabId: 1,
    frameId: 0,
    origin: "https://news.example",
    observedAt: 1_000,
    source: "network",
    trackerId: "fullstory",
    companyId: "fullstory",
    firstParty: false,
    eventType: "request_seen",
    blockability: "network_blockable",
    status: "active",
    confidence: "confirmed",
    evidence: ["Request matched fullstory domain fullstory.com."],
    ...overrides
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("registerNetworkObserver: unclassified and tracker-matched requests", () => {
  it("records a third-party request that matches no tracker record, keyed by host", async () => {
    const { deps, onBeforeRequest } = register()

    onBeforeRequest(requestOf())
    await flush()

    expect(deps.recordEvent).toHaveBeenCalledTimes(1)
    expect(deps.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "request_unclassified:1:cdn.unknown.example",
        eventType: "request_seen",
        firstParty: false,
        evidenceTier: "observed",
        origin: "https://news.example",
        observedAt: 1_000,
        details: expect.objectContaining({ host: "cdn.unknown.example", requestId: "r1", requestType: "script" })
      })
    )
  })

  it("does not record requests without a tab, same-site requests, or non-observable request types", async () => {
    const { deps, onBeforeRequest } = register()

    onBeforeRequest(requestOf({ tabId: -1 }))
    onBeforeRequest(requestOf({ type: "main_frame" }))
    onBeforeRequest(requestOf({ initiator: "https://www.cnn.com", url: "https://media.cnn.com/app.js" }))
    // No initiator: the request's own origin is the fallback, making it first-party to itself.
    onBeforeRequest(requestOf({ initiator: undefined }))
    await flush()

    expect(deps.recordEvent).not.toHaveBeenCalled()
  })

  it("judges first/third party against the pinned top-level tab origin, not the initiator", async () => {
    const { deps, summaries, onBeforeRequest } = register()
    summaries.set(1, createEmptySiteSummary("https://news.example", 1))

    // Initiator and URL share a site, but the tab's pinned origin says third party.
    onBeforeRequest(requestOf({ initiator: "https://cdn.unknown.example" }))
    await flush()

    expect(deps.recordEvent).toHaveBeenCalledWith(expect.objectContaining({ id: "request_unclassified:1:cdn.unknown.example" }))
  })

  it("records request_seen with tracker attribution when the tracker database matches", async () => {
    const { deps, onBeforeRequest } = register()

    onBeforeRequest(requestOf({ requestId: "r2", type: "xmlhttprequest", url: "https://www.google-analytics.com/g/collect?v=2" }))
    await flush()

    expect(deps.recordEvent).toHaveBeenCalledTimes(1)
    expect(deps.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "request_seen:1:r2:google-analytics",
        trackerId: "google-analytics",
        eventType: "request_seen",
        status: "active",
        firstParty: false
      })
    )
  })

  it("records a cookie_sync observation when a matched request is sync-shaped", async () => {
    const { deps, onBeforeRequest } = register()

    onBeforeRequest(requestOf({ requestId: "r3", type: "xmlhttprequest", url: "https://www.google-analytics.com/getuid?v=2" }))
    await flush()

    expect(deps.recordEvent).toHaveBeenCalledTimes(2)
    expect(deps.recordEvent).toHaveBeenCalledWith(expect.objectContaining({ id: "request_seen:1:r3:google-analytics" }))
    expect(deps.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "cookie_sync:1:r3:google-analytics",
        eventType: "cookie_sync",
        details: expect.objectContaining({ syncIndicators: expect.stringContaining("sync_path:getuid") })
      })
    )
  })
})

describe("registerNetworkObserver: cache validator headers", () => {
  it("records a first-party request validator keyed by host and header", async () => {
    const { deps, onBeforeSendHeaders } = register()

    onBeforeSendHeaders(
      requestOf({
        url: "https://static.news.example/app.js",
        requestHeaders: [{ name: "If-None-Match", value: "etag" }, { name: "Accept" }]
      })
    )
    await flush()

    expect(deps.recordEvent).toHaveBeenCalledTimes(1)
    expect(deps.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "cache_validator_seen:1:static.news.example:request:if-none-match",
        eventType: "cache_validator_seen",
        firstParty: true,
        policyLabel: "unknown_first_party",
        details: expect.objectContaining({ direction: "request", headerName: "If-None-Match", host: "static.news.example" })
      })
    )
  })

  it("records one third-party response event per distinct validator header, without a first-party policy label", async () => {
    const { deps, onHeadersReceived } = register()

    onHeadersReceived(
      requestOf({
        url: "https://cdn.unknown.example/app.js",
        responseHeaders: [{ name: "ETag" }, { name: "Last-Modified" }, { name: "ETag" }]
      })
    )
    await flush()

    expect(deps.recordEvent).toHaveBeenCalledTimes(2)
    const events = vi.mocked(deps.recordEvent).mock.calls.map(([event]) => event as ObserverEvent)
    expect(events.map((event) => event.id).sort()).toEqual([
      "cache_validator_seen:1:cdn.unknown.example:response:etag",
      "cache_validator_seen:1:cdn.unknown.example:response:last-modified"
    ])
    expect(events.every((event) => event.firstParty === false && event.policyLabel === undefined)).toBe(true)
  })

  it("ignores tabless requests and requests without cache validator headers", async () => {
    const { deps, onBeforeSendHeaders, onHeadersReceived } = register()

    onBeforeSendHeaders(requestOf({ tabId: -1, requestHeaders: [{ name: "If-None-Match" }] }))
    onBeforeSendHeaders(requestOf({ requestHeaders: [{ name: "Accept" }] }))
    onHeadersReceived(requestOf({ responseHeaders: undefined }))
    await flush()

    expect(deps.recordEvent).not.toHaveBeenCalled()
  })
})

describe("registerNetworkObserver: deterministic blocked outcomes", () => {
  afterEach(async () => {
    vi.mocked(chrome.declarativeNetRequest.getDynamicRules).mockResolvedValue([])
    await uninstallDynamicBlockRules()
  })

  async function installFullstory() {
    vi.mocked(chrome.declarativeNetRequest.getDynamicRules).mockResolvedValueOnce([])
    await installDynamicBlockRules(["fullstory"])
  }

  const blockedRequest = requestOf({
    requestId: "r9",
    url: "https://edge.fullstory.com/s/fs.js",
    error: "net::ERR_BLOCKED_BY_CLIENT"
  })

  it("records a blocked event when ERR_BLOCKED_BY_CLIENT matches a rule this extension installed", async () => {
    await installFullstory()
    const { deps, onErrorOccurred } = register()

    onErrorOccurred(blockedRequest)
    await flush()

    expect(deps.recordEvent).toHaveBeenCalledTimes(1)
    expect(deps.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "request_blocked:1:r9:fullstory",
        eventType: "request_blocked",
        status: "blocked",
        trackerId: "fullstory",
        details: expect.objectContaining({ blockSignals: "err_blocked_by_client", url: blockedRequest.url })
      })
    )
  })

  it("never claims other errors, other extensions' blocks, or tabless requests", async () => {
    await installFullstory()
    const { deps, onErrorOccurred } = register()

    onErrorOccurred({ ...blockedRequest, error: "net::ERR_FAILED" })
    onErrorOccurred({ ...blockedRequest, tabId: -1 })
    // Blocked by someone, but no installed rule of ours covers this URL.
    onErrorOccurred({ ...blockedRequest, url: "https://www.google-analytics.com/g/collect" })
    await flush()

    expect(deps.recordEvent).not.toHaveBeenCalled()
  })

  it("waits for the initial rule sync before judging a blocked outcome", async () => {
    await installFullstory()
    let releaseRuleSync!: () => void
    const initialRuleSync = new Promise<void>((resolve) => {
      releaseRuleSync = resolve
    })
    const { deps, onErrorOccurred } = register({ initialRuleSync })

    onErrorOccurred(blockedRequest)
    await flush()
    expect(deps.ensureHydrated).not.toHaveBeenCalled()
    expect(deps.recordEvent).not.toHaveBeenCalled()

    releaseRuleSync()
    await flush()
    expect(deps.recordEvent).toHaveBeenCalledWith(expect.objectContaining({ id: "request_blocked:1:r9:fullstory" }))
  })

  it("supersedes the request_seen event for the same request when the block outcome arrives", async () => {
    await installFullstory()
    const { deps, summaries, onErrorOccurred } = register()
    summaries.set(1, summaryWithEvents([fullstoryEvent({ id: "request_seen:1:r9:fullstory" })]))

    onErrorOccurred(blockedRequest)
    await flush()

    expect(deps.writeTabSummary).toHaveBeenCalled()
    expect(summaries.get(1)?.events.some((event) => event.id === "request_seen:1:r9:fullstory")).toBe(false)
    expect(deps.recordEvent).toHaveBeenCalledWith(expect.objectContaining({ id: "request_blocked:1:r9:fullstory" }))
  })

  it("annotates blockSignals instead of double-recording when a second signal confirms the same block", async () => {
    await installFullstory()
    const { deps, summaries, onErrorOccurred } = register()
    summaries.set(
      1,
      summaryWithEvents([
        fullstoryEvent({
          id: "request_blocked:1:r9:fullstory",
          eventType: "request_blocked",
          status: "blocked",
          details: { blockSignals: "rule_matched_debug" }
        })
      ])
    )

    onErrorOccurred(blockedRequest)
    await flush()

    expect(deps.recordEvent).not.toHaveBeenCalled()
    expect(deps.scheduleSummaryWrite).toHaveBeenCalledTimes(1)
    const stored = summaries.get(1)?.events.find((event) => event.id === "request_blocked:1:r9:fullstory")
    expect(stored?.details?.blockSignals).toBe("err_blocked_by_client,rule_matched_debug")
  })

  it("ignores a duplicate of an already-recorded signal entirely", async () => {
    await installFullstory()
    const { deps, onErrorOccurred } = register()
    const blocked = fullstoryEvent({
      id: "request_blocked:1:r9:fullstory",
      eventType: "request_blocked",
      status: "blocked",
      details: { blockSignals: "err_blocked_by_client" }
    })
    vi.mocked(deps.readTabSummary).mockReturnValue(summaryWithEvents([blocked]))

    onErrorOccurred(blockedRequest)
    await flush()

    expect(deps.recordEvent).not.toHaveBeenCalled()
    expect(deps.writeTabSummary).not.toHaveBeenCalled()
    expect(deps.scheduleSummaryWrite).not.toHaveBeenCalled()
  })

  it("records a blocked outcome from onRuleMatchedDebug using the installed rule's metadata", async () => {
    await installFullstory()
    const installedRules = vi.mocked(chrome.declarativeNetRequest.updateDynamicRules).mock.calls.at(-1)?.[0].addRules ?? []
    const fullstoryRule = installedRules.find((rule) => rule.condition.urlFilter === "||fullstory.com^")
    expect(fullstoryRule).toBeTruthy()

    const { deps, onRuleMatchedDebug } = register()
    onRuleMatchedDebug({ rule: { ruleId: fullstoryRule!.id }, request: requestOf({ requestId: "r10", url: "https://fullstory.com/s/fs.js" }) })
    await flush()

    expect(deps.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "request_blocked:1:r10:fullstory",
        details: expect.objectContaining({ blockSignals: "rule_matched_debug" })
      })
    )
  })

  it("warns instead of throwing when event recording or hydration fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    try {
      await installFullstory()
      const { deps, onBeforeRequest, onBeforeSendHeaders, onErrorOccurred } = register({
        recordEvent: vi.fn().mockRejectedValue(new Error("storage failed"))
      })

      onBeforeRequest(requestOf())
      onBeforeRequest(requestOf({ requestId: "r2", type: "xmlhttprequest", url: "https://www.google-analytics.com/getuid?v=2" }))
      onBeforeSendHeaders(requestOf({ requestHeaders: [{ name: "ETag" }] }))
      onErrorOccurred(blockedRequest)
      await flush()
      expect(deps.recordEvent).toHaveBeenCalled()

      // Hydration failures inside the blocked-outcome chain land in its catch.
      const hydrationFailure = register({ ensureHydrated: vi.fn().mockRejectedValue(new Error("hydration failed")) })
      hydrationFailure.onErrorOccurred(blockedRequest)
      await flush()

      expect(warn).toHaveBeenCalledWith("Failed to record unclassified network event", expect.any(Error))
      expect(warn).toHaveBeenCalledWith("Failed to record network observer event", expect.any(Error))
      expect(warn).toHaveBeenCalledWith("Failed to record cookie sync event", expect.any(Error))
      expect(warn).toHaveBeenCalledWith("Failed to record cache validator event", expect.any(Error))
      expect(warn).toHaveBeenCalledWith("Failed to record blocked network event", expect.any(Error))
      expect(warn).toHaveBeenCalledWith("Failed to record blocked outcome", expect.any(Error))
    } finally {
      warn.mockRestore()
    }
  })

  it("ignores onRuleMatchedDebug for unknown rules and tabless requests", async () => {
    await installFullstory()
    const { deps, onRuleMatchedDebug } = register()

    onRuleMatchedDebug({ rule: { ruleId: 1 }, request: requestOf({ requestId: "r11", url: "https://fullstory.com/s/fs.js" }) })
    onRuleMatchedDebug({ rule: { ruleId: 10_000 }, request: requestOf({ tabId: -1 }) })
    await flush()

    expect(deps.recordEvent).not.toHaveBeenCalled()
  })
})
