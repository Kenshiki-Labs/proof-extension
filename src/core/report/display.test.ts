import { describe, expect, it } from "vitest"

import type { ObserverEvent } from "~core/domain/types"
import { buildAtomicSignalRows, compactEvents, compactPageErrors, exposureScanEvents, pageActivityEvents } from "./display"

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