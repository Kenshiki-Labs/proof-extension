import { describe, expect, it } from "vitest"

import type { ObserverEvent, SiteSummary } from "~core/domain/types"
import {
  blockabilitySummary,
  buildAtomicSignalRows,
  buildCopyPayload,
  compactEvents,
  compactPageErrors,
  detailEntries,
  EMPTY_SUMMARY,
  eventSummary,
  exposureScanEvents,
  formatCopyEvent,
  formatDetailKey,
  formatTime,
  observerName,
  pageActivityEvents,
  parseSiteSummaryResponse,
  titleCase,
  visibleSignals
} from "./display"

function event(overrides: Partial<ObserverEvent> = {}): ObserverEvent {
  return {
    id: "event-1",
    tabId: 1,
    origin: "https://example.test",
    observedAt: 100,
    source: "api-hook",
    firstParty: true,
    policyLabel: "fingerprinting",
    eventType: "canvas_read",
    blockability: "content_mitigatable",
    status: "active",
    confidence: "probable",
    evidence: ["Canvas read observed."],
    ...overrides
  }
}

describe("buildAtomicSignalRows", () => {
  it("groups events by atomic signal and accumulates counts", () => {
    const rows = buildAtomicSignalRows([
      event({ id: "canvas", count: 2 }),
      event({ id: "webgl", eventType: "webgl_query", observedAt: 200, evidence: ["WebGL queried."] })
    ])

    expect(rows).toMatchObject([
      { signal: "webgl_query", count: 1, latestEvidence: "WebGL queried." },
      { signal: "canvas_read", count: 2, capability: "Observed; mitigation possible" }
    ])
  })

  it("uses the strongest status and blockability seen for a signal", () => {
    const rows = buildAtomicSignalRows([
      event({ id: "active", status: "active", observedAt: 100 }),
      event({ id: "mitigated", status: "mitigated", observedAt: 200, evidence: ["Mitigated canvas read."] })
    ])

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      signal: "canvas_read",
      status: "mitigated",
      blockability: "content_mitigatable",
      capability: "Observed and mitigated",
      count: 2,
      latestEvidence: "Mitigated canvas read."
    })
  })
})

describe("compactEvents", () => {
  it("omits extension diagnostics from display observations", () => {
    const observations = compactEvents([
      event({ id: "diagnostic", eventType: "script_injected", policyLabel: "unknown_first_party" }),
      event({ id: "canvas" })
    ])

    expect(observations.map((item) => item.event.eventType)).toEqual(["canvas_read"])
  })

  it("collapses repeated network requests for the same observer and signal", () => {
    const observations = compactEvents([
      event({
        id: "request-1",
        source: "network",
        firstParty: false,
        trackerId: "google-ads",
        companyId: "google",
        eventType: "request_seen",
        blockability: "network_blockable",
        evidence: ["Request matched google-ads domain doubleclick.net."]
      }),
      event({
        id: "request-2",
        source: "network",
        firstParty: false,
        trackerId: "google-ads",
        companyId: "google",
        eventType: "request_seen",
        blockability: "network_blockable",
        observedAt: 200,
        evidence: ["Request matched google-ads domain googlesyndication.com."]
      })
    ])

    expect(observations).toHaveLength(1)
    expect(observations[0]).toMatchObject({
      count: 2,
      event: {
        id: "request-2",
        evidence: ["Request matched google-ads domain googlesyndication.com."]
      }
    })
  })
})

describe("event families", () => {
  it("separates extension exposure scans from page activity", () => {
    const page = event({ id: "canvas" })
    const exposure = event({
      id: "browser-surface",
      source: "extension-scan",
      eventType: "browser_surface",
      blockability: "observable_only",
      evidence: ["Browser APIs exposed passive surface fields to the extension scan."]
    })

    expect(pageActivityEvents([page, exposure])).toEqual([page])
    expect(exposureScanEvents([page, exposure])).toEqual([exposure])
    expect(buildAtomicSignalRows([page, exposure]).map((row) => row.signal)).toEqual(["canvas_read"])
  })
})

describe("display formatting helpers", () => {
  it("title-cases underscore-separated values", () => {
    expect(titleCase("request_seen")).toBe("Request Seen")
    expect(titleCase("cannot_block")).toBe("Cannot Block")
  })

  it("names observers from company, tracker, or party fallback", () => {
    expect(observerName(event({ companyId: "google", trackerId: "google-ads" }))).toBe("google")
    expect(observerName(event({ trackerId: "google-ads" }))).toBe("google-ads")
    expect(observerName(event({ firstParty: true }))).toBe("First-party script")
    expect(observerName(event({ firstParty: false }))).toBe("Unknown observer")
  })

  it("filters diagnostics out of visible signals", () => {
    const summary: SiteSummary = { ...EMPTY_SUMMARY, exposedSignals: ["browser_surface", "extension_diagnostic"] }
    expect(visibleSignals(summary)).toEqual(["browser_surface"])
  })

  it("summarizes each event type in factual language", () => {
    expect(eventSummary(event({ eventType: "canvas_read" }))).toBe("Canvas data was read by page script.")
    expect(eventSummary(event({ eventType: "webgl_query" }))).toBe("WebGL rendering details were queried.")
    expect(eventSummary(event({ eventType: "audio_fingerprint" }))).toBe("Audio rendering behavior was sampled.")
    expect(eventSummary(event({ eventType: "font_enumeration" }))).toBe("Font surface was enumerated.")
    expect(eventSummary(event({ eventType: "request_blocked" }))).toBe("A tracker network request was blocked.")
    expect(eventSummary(event({ eventType: "request_seen" }))).toBe("A tracker network request was observed.")
    expect(eventSummary(event({ eventType: "script_injected" }))).toBe("A script was inserted into the page after load.")
    expect(eventSummary(event({ eventType: "extension_diagnostic" }))).toBe("Extension self-check.")
    expect(eventSummary(event({ eventType: "browser_surface" }))).toBe(
      "Browser surface fields were readable by local JavaScript."
    )
    expect(eventSummary(event({ eventType: "cookie_sync" }))).toBe("Cookie Sync observed.")
  })

  it("describes capability for every blockability class without overclaiming", () => {
    expect(blockabilitySummary({ blockability: "network_blockable", status: "blocked" })).toBe("Observed and blocked")
    expect(blockabilitySummary({ blockability: "network_blockable", status: "active" })).toBe(
      "Observed; network block available"
    )
    expect(blockabilitySummary({ blockability: "content_mitigatable", status: "mitigated" })).toBe("Observed and mitigated")
    expect(blockabilitySummary({ blockability: "content_mitigatable", status: "active" })).toBe(
      "Observed; mitigation possible"
    )
    expect(blockabilitySummary({ blockability: "observable_only", status: "active" })).toBe("Observed only")
    expect(blockabilitySummary({ blockability: "pre_request_unblockable", status: "cannot_block" })).toBe(
      "Observed after browser already sent it"
    )
    expect(blockabilitySummary({ blockability: "server_side_unblockable", status: "cannot_block" })).toBe(
      "Visible to the server, not blockable here"
    )
    expect(blockabilitySummary({ blockability: "user_action_required", status: "active" })).toBe(
      "Requires source-level action"
    )
  })

  it("formats detail keys and filters empty detail values", () => {
    expect(formatDetailKey("url")).toBe("URL")
    expect(formatDetailKey("id")).toBe("ID")
    expect(formatDetailKey("script_origin")).toBe("Script Origin")

    expect(detailEntries(event({ details: { apiGroup: "canvas", empty: "", count: 3 } }))).toEqual([
      ["apiGroup", "canvas"],
      ["count", 3]
    ])
    expect(detailEntries(event())).toEqual([])
  })

  it("formats timestamps and reports missing ones as unknown", () => {
    expect(formatTime(0)).toBe("Unknown")
    expect(formatTime(Date.UTC(2026, 6, 3, 12, 34, 56))).toMatch(/\d{2}:\d{2}:\d{2}/)
  })
})

describe("parseSiteSummaryResponse", () => {
  const summary: SiteSummary = { ...EMPTY_SUMMARY, origin: "https://example.test", tabId: 7, incomplete: false }

  it("accepts a bare summary payload", () => {
    const parsed = parseSiteSummaryResponse(summary)
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.origin).toBe("https://example.test")
  })

  it("unwraps a SITE_SUMMARY runtime message", () => {
    const parsed = parseSiteSummaryResponse({ type: "SITE_SUMMARY", payload: summary })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.tabId).toBe(7)
  })

  it("normalizes summaries persisted before pageErrors existed", () => {
    const legacySummary: Partial<SiteSummary> = { ...summary }
    delete legacySummary.pageErrors
    const parsed = parseSiteSummaryResponse(legacySummary)
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.pageErrors).toEqual([])
  })

  it("rejects malformed responses", () => {
    expect(parseSiteSummaryResponse(undefined).success).toBe(false)
    expect(parseSiteSummaryResponse({ type: "SITE_SUMMARY", payload: { origin: 1 } }).success).toBe(false)
  })
})

describe("copy payload", () => {
  it("joins remediation metadata for known trackers", () => {
    const copied = formatCopyEvent(
      event({
        source: "network",
        firstParty: false,
        eventType: "request_seen",
        blockability: "network_blockable",
        trackerId: "fullstory",
        companyId: "fullstory"
      }),
      3
    )

    expect(copied.count).toBe(3)
    expect(copied.remediation).not.toBeNull()
    expect(copied.observer).toBe(copied.remediation?.observerName)
    expect(copied.remediation?.deletionUrl).toBeTruthy()
  })

  it("copies unknown observers without inventing remediation", () => {
    const copied = formatCopyEvent(event(), 1)
    expect(copied.remediation).toBeNull()
    expect(copied.observer).toBe("First-party script")
  })

  it("builds a self-contained report with family-separated counts", () => {
    const summary: SiteSummary = {
      ...EMPTY_SUMMARY,
      origin: "https://example.test",
      tabId: 7,
      incomplete: false,
      activeCompanies: ["fullstory"],
      exposedSignals: ["browser_surface", "extension_diagnostic"],
      events: [
        event({ id: "canvas" }),
        event({
          id: "exposure",
          source: "extension-scan",
          eventType: "browser_surface",
          blockability: "observable_only"
        }),
        event({ id: "diagnostic", eventType: "extension_diagnostic", blockability: "observable_only" })
      ]
    }

    const payload = JSON.parse(buildCopyPayload(summary))

    expect(payload.origin).toBe("https://example.test")
    expect(payload.counts).toMatchObject({
      observations: 2,
      rawEvents: 1,
      exposureScanEvents: 1,
      diagnostics: 1,
      activeCompanies: 1,
      exposedSignals: 1
    })
    expect(payload.pageActivityEvents).toHaveLength(1)
    expect(payload.exposureScanEvents).toHaveLength(1)
    expect(payload.diagnostics).toHaveLength(1)
  })
})

describe("compactPageErrors", () => {
  it("collapses repeated page errors by message and stack preview", () => {
    const errors = compactPageErrors([
      { id: "error-1", message: "Script failed", observedAt: 100 },
      { id: "error-2", message: "Script failed", observedAt: 200 },
      { id: "error-3", message: "Different failure", observedAt: 150 }
    ])

    expect(errors).toMatchObject([
      { pageError: { id: "error-2", message: "Script failed" }, count: 2 },
      { pageError: { id: "error-3", message: "Different failure" }, count: 1 }
    ])
  })
})