import { afterEach, describe, expect, it, vi } from "vitest"
import browser from "webextension-polyfill"

import { generateAiAuditReport, urlIsGov } from "./audit-client"

vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: { getURL: (path: string) => `chrome-extension://test-extension-id/${path}` },
    tabs: { get: vi.fn() }
  }
}))

const tabsGet = vi.mocked(browser.tabs.get)

function mockTabUrl(url: string | undefined) {
  tabsGet.mockResolvedValue({ url } as unknown as Awaited<ReturnType<typeof browser.tabs.get>>)
}

function mockFetchResponse(status: number, body: unknown) {
  const response = {
    ok: status >= 200 && status < 300,
    status,
    json: () => (body === undefined ? Promise.reject(new Error("no body")) : Promise.resolve(body))
  }
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response))
}

afterEach(() => {
  vi.unstubAllGlobals()
  tabsGet.mockReset()
})

describe("urlIsGov", () => {
  it("accepts .gov hostnames case-insensitively", () => {
    expect(urlIsGov("https://www.ssa.gov/myaccount")).toBe(true)
    expect(urlIsGov("https://WWW.SSA.GOV/")).toBe(true)
  })

  it("rejects non-.gov hostnames, including lookalikes", () => {
    expect(urlIsGov("https://example.com/")).toBe(false)
    expect(urlIsGov("https://ssa.gov.evil.example/")).toBe(false)
  })

  it("rejects missing and malformed URLs instead of throwing", () => {
    expect(urlIsGov(undefined)).toBe(false)
    expect(urlIsGov("not a url")).toBe(false)
  })
})

describe("generateAiAuditReport", () => {
  it("rejects tabs that are not on a .gov origin without calling the proxy", async () => {
    mockTabUrl("https://news.example/story")
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)

    await expect(generateAiAuditReport({ auditPayload: "payload", tabId: 1 })).resolves.toEqual({
      type: "AI_AUDIT_REPORT_FAILED",
      error: "AI audit reports are enabled only for .gov origins."
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("fails when the audited tab is gone", async () => {
    tabsGet.mockRejectedValue(new Error("No tab with id"))

    await expect(generateAiAuditReport({ auditPayload: "payload", tabId: 42 })).resolves.toEqual({
      type: "AI_AUDIT_REPORT_FAILED",
      error: "The audited tab is no longer open."
    })
  })

  it("returns the trimmed report on success", async () => {
    mockTabUrl("https://www.irs.gov/refunds")
    mockFetchResponse(200, { report: "  The report body.  " })

    await expect(generateAiAuditReport({ auditPayload: "payload", tabId: 1 })).resolves.toEqual({
      type: "AI_AUDIT_REPORT",
      payload: { report: "The report body." }
    })
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "https://pulse-ai-audit.kenshiki.workers.dev/",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ auditPayload: "payload" }) })
    )
  })

  it("surfaces the proxy's own error string on a non-ok response", async () => {
    mockTabUrl("https://www.irs.gov/refunds")
    mockFetchResponse(429, { error: "Rate limited, try again shortly." })

    await expect(generateAiAuditReport({ auditPayload: "payload", tabId: 1 })).resolves.toEqual({
      type: "AI_AUDIT_REPORT_FAILED",
      error: "Rate limited, try again shortly."
    })
  })

  it("falls back to a generic message with the status when a non-ok response has no usable body", async () => {
    mockTabUrl("https://www.irs.gov/refunds")
    mockFetchResponse(503, undefined)

    await expect(generateAiAuditReport({ auditPayload: "payload", tabId: 1 })).resolves.toEqual({
      type: "AI_AUDIT_REPORT_FAILED",
      error: "The audit service is unavailable right now (503)."
    })
  })

  it("fails on an ok response whose report is empty or missing", async () => {
    mockTabUrl("https://www.irs.gov/refunds")
    mockFetchResponse(200, { report: "   " })
    await expect(generateAiAuditReport({ auditPayload: "payload", tabId: 1 })).resolves.toEqual({
      type: "AI_AUDIT_REPORT_FAILED",
      error: "The audit service returned an empty report."
    })

    mockFetchResponse(200, {})
    await expect(generateAiAuditReport({ auditPayload: "payload", tabId: 1 })).resolves.toEqual({
      type: "AI_AUDIT_REPORT_FAILED",
      error: "The audit service returned an empty report."
    })
  })

  it("maps a thrown fetch error to a failure message", async () => {
    mockTabUrl("https://www.irs.gov/refunds")
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")))

    await expect(generateAiAuditReport({ auditPayload: "payload", tabId: 1 })).resolves.toEqual({
      type: "AI_AUDIT_REPORT_FAILED",
      error: "network down"
    })
  })

  it("stringifies non-Error throwables", async () => {
    mockTabUrl("https://www.irs.gov/refunds")
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue("weird failure"))

    await expect(generateAiAuditReport({ auditPayload: "payload", tabId: 1 })).resolves.toEqual({
      type: "AI_AUDIT_REPORT_FAILED",
      error: "weird failure"
    })
  })
})
