import { describe, expect, it } from "vitest"

import type { ObserverEvent, SiteSummary } from "~core/domain/types"
import {
  blockabilitySummary,
  buildAtomicSignalRows,
  buildCookieMetadataRollup,
  buildLocalStatePurposeRollup,
  buildLocalStateRollup,
  buildCopyPayload,
  classifyStoragePurpose,
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
  unclassifiedObservations,
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
      { signal: "canvas_read", count: 2, capability: "Seen — it can be limited" }
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
      capability: "Seen, and limited",
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

  it("keeps unclassified third-party hosts separate by host", () => {
    const observations = compactEvents([
      event({
        id: "unknown-1",
        source: "network",
        firstParty: false,
        eventType: "request_seen",
        blockability: "observable_only",
        evidenceTier: "observed",
        details: { host: "a.example", requestId: "1", requestType: "script", url: "https://a.example/a.js" }
      }),
      event({
        id: "unknown-2",
        source: "network",
        firstParty: false,
        eventType: "request_seen",
        blockability: "observable_only",
        evidenceTier: "observed",
        details: { host: "b.example", requestId: "2", requestType: "script", url: "https://b.example/b.js" }
      })
    ])

    expect(observations.map((item) => observerName(item.event)).sort()).toEqual(["a.example", "b.example"])
    expect(unclassifiedObservations(observations.map((item) => item.event))).toHaveLength(2)
  })

  it("keeps browser cookie metadata rows separate by cookie name", () => {
    const observations = compactEvents([
      event({
        id: "cookie-a",
        source: "extension-scan",
        eventType: "cookie_observed",
        blockability: "observable_only",
        evidenceTier: "observed",
        evidence: ["Cookie values are never recorded."],
        details: { name: "session_id", domain: "example.test", httpOnly: true, secure: true, session: false, sameSite: "lax" }
      }),
      event({
        id: "cookie-b",
        source: "extension-scan",
        eventType: "cookie_observed",
        blockability: "observable_only",
        evidenceTier: "observed",
        evidence: ["Cookie values are never recorded."],
        observedAt: 200,
        details: { name: "FTR_Cache_Status", domain: "example.test", httpOnly: false, secure: false, session: true, sameSite: "unspecified" }
      })
    ])

    expect(observations).toHaveLength(2)
    expect(observations.map(({ event }) => event.details?.name).sort()).toEqual(["FTR_Cache_Status", "session_id"])
  })

  it("keeps page-hook cookie writes separate by cookie name too — not only extension scans", () => {
    // Regression: the cookie metadata key was only built for extension-scan
    // events, so distinctly named cookies written by page scripts collapsed
    // into a single merged row.
    const observations = compactEvents([
      event({
        id: "hook-cookie-a",
        source: "api-hook",
        eventType: "cookie_observed",
        blockability: "observable_only",
        evidenceTier: "observed",
        evidence: ["Cookie values are never recorded."],
        details: { name: "consent_state", domain: "example.test" }
      }),
      event({
        id: "hook-cookie-b",
        source: "api-hook",
        eventType: "cookie_observed",
        blockability: "observable_only",
        evidenceTier: "observed",
        evidence: ["Cookie values are never recorded."],
        observedAt: 200,
        details: { name: "ab_bucket", domain: "example.test" }
      })
    ])

    expect(observations).toHaveLength(2)
    expect(observations.map(({ event }) => event.details?.name).sort()).toEqual(["ab_bucket", "consent_state"])
  })
})

describe("buildCookieMetadataRollup", () => {
  it("summarizes browser cookie metadata into local-state counts and takeaways", () => {
    const observations = compactEvents([
      event({
        id: "cookie-a",
        source: "extension-scan",
        eventType: "cookie_observed",
        blockability: "observable_only",
        evidenceTier: "observed",
        evidence: ["Cookie values are never recorded."],
        details: { name: "session_id", domain: "example.test", httpOnly: true, secure: true, session: false, sameSite: "lax" }
      }),
      event({
        id: "cookie-b",
        source: "extension-scan",
        eventType: "cookie_observed",
        blockability: "observable_only",
        evidenceTier: "observed",
        evidence: ["Cookie values are never recorded."],
        details: { name: "cache", domain: "example.test", httpOnly: false, secure: false, session: true, sameSite: "unspecified" }
      })
    ])

    expect(buildCookieMetadataRollup(observations)).toMatchObject({
      httpOnlyCookies: 1,
      insecureCookies: 1,
      javascriptReadableCookies: 1,
      persistentCookies: 1,
      sameSiteSummary: "1 lax · 1 unspecified",
      sessionCookies: 1,
      totalCookies: 2
    })
    expect(buildCookieMetadataRollup(observations).takeaways).toEqual(expect.arrayContaining([
      expect.stringContaining("readable by page scripts"),
      expect.stringContaining("HttpOnly"),
      expect.stringContaining("not marked Secure"),
      expect.stringContaining("beyond the current browser session")
    ]))
  })
})

describe("buildLocalStateRollup", () => {
  it("summarizes local-state mechanisms across cookies, storage, cache, and workers", () => {
    const observations = compactEvents([
      event({
        id: "cookie-a",
        source: "extension-scan",
        eventType: "cookie_observed",
        blockability: "observable_only",
        evidence: ["Cookie values are never recorded."],
        details: { name: "session_id", domain: "example.test", httpOnly: true, secure: true, session: false, sameSite: "lax" }
      }),
      event({ id: "storage", eventType: "storage_write", evidence: ["Storage write observed."], details: { area: "localStorage", key: "cart", valueBytes: 12 } }),
      event({ id: "cache", eventType: "cache_storage_access", evidence: ["Cache Storage access observed."], details: { op: "open", cache: "site-cache" } }),
      event({ id: "worker", eventType: "service_worker_registered", evidence: ["Service worker registered."], details: { scopePath: "/" } })
    ])

    expect(buildLocalStateRollup(observations)).toMatchObject({
      backgroundWorkers: 1,
      browserOnlyRecords: 1,
      durableRecords: 4,
      scriptReadableRecords: 3,
      sessionRecords: 0,
      totalRecords: 4
    })
    expect(buildLocalStateRollup(observations).families.map((family) => family.label)).toEqual(expect.arrayContaining(["Cookies", "Web Storage", "Cache Storage", "Service workers"]))
  })

  it("classifies browser-only, session, and non-durable records without double-counting", () => {
    const observations = compactEvents([
      // Browser-only + non-durable + not script-readable: exercises the
      // fallbacks in the script-readable and durable classifiers.
      event({ id: "cache-validator", eventType: "cache_validator_seen", blockability: "observable_only", evidence: ["Cache validator seen."], details: { header: "if-none-match" } }),
      // Session-scoped storage: durable classifier's storage_write branch takes
      // its false side; session classifier takes its true side.
      event({ id: "session-storage", eventType: "storage_write", evidence: ["Storage write observed."], details: { area: "sessionStorage", key: "step", valueBytes: 4 } }),
      // Session cookie, script-readable (httpOnly false), NOT durable: exercises
      // the durable cookie condition's false side.
      event({ id: "session-cookie", source: "extension-scan", eventType: "cookie_observed", blockability: "observable_only", evidence: ["Cookie values are never recorded."], details: { name: "csrf", domain: "example.test", httpOnly: false, secure: true, session: true, sameSite: "strict" } })
    ])

    expect(buildLocalStateRollup(observations)).toMatchObject({
      backgroundWorkers: 0,
      browserOnlyRecords: 1,
      durableRecords: 0,
      scriptReadableRecords: 2,
      sessionRecords: 2,
      totalRecords: 3
    })
  })
})

describe("eventSummary", () => {
  it("describes persistence and cookie observations in plain language", () => {
    expect(eventSummary(event({ eventType: "cookie_observed", evidence: ["x"] }))).toContain("its contents were not read")
    expect(eventSummary(event({ eventType: "cache_validator_seen", evidence: ["x"] }))).toContain("marker value was not recorded")
    expect(eventSummary(event({ eventType: "service_worker_registered", evidence: ["x"] }))).toContain("background worker")
  })

  it("falls back to a titled summary for event types without bespoke copy", () => {
    expect(eventSummary(event({ eventType: "webrtc_probe", evidence: ["x"] }))).toMatch(/observed\.$/)
  })
})

describe("buildLocalStatePurposeRollup", () => {
  it("classifies Web Storage keys without using values", () => {
    const observations = compactEvents([
      event({ id: "storage-cart", eventType: "storage_write", evidence: ["Storage write observed."], details: { area: "localStorage", op: "set", key: "cart", valueBytes: 12 } }),
      event({ id: "storage-csm", eventType: "storage_write", evidence: ["Storage write observed."], details: { area: "localStorage", op: "set", key: "csm-hit", valueBytes: 69 } }),
      event({ id: "storage-events", eventType: "storage_write", evidence: ["Storage write observed."], count: 3, details: { area: "sessionStorage", op: "set", key: "amzn:fwcim:events", valueBytes: 1353 } }),
      event({ id: "storage-remove", eventType: "storage_write", evidence: ["Storage write observed."], count: 2, details: { area: "sessionStorage", op: "remove", key: "amzn:fwcim:events" } }),
      event({ id: "storage-clear", eventType: "storage_write", evidence: ["Storage write observed."], details: { area: "localStorage", op: "clear" } }),
      event({ id: "storage-hidden", eventType: "storage_write", evidence: ["Storage write observed."], details: { area: "sessionStorage", op: "set", key: "[hidden 20]", valueBytes: 1 } }),
      event({ id: "cookie", eventType: "cookie_observed", evidence: ["Cookie observed."], details: { name: "cart" } })
    ])

    const rollup = buildLocalStatePurposeRollup(observations)

    expect(rollup).toMatchObject({
      clearOperations: 1,
      deleteOperations: 2,
      localStorageRecords: 3,
      sessionStorageRecords: 6,
      setOperations: 6,
      totalRecords: 9
    })
    expect(rollup.purposes).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Analytics and event queues", count: 5, keyExamples: ["amzn:fwcim:events"] }),
      expect.objectContaining({ label: "Cart and commerce", count: 1, keyExamples: ["cart"] }),
      expect.objectContaining({ label: "Performance and diagnostics", count: 1, keyExamples: ["csm-hit"] }),
      expect.objectContaining({ label: "Unclassified storage keys", count: 1, keyExamples: [] })
    ]))
    expect(rollup.takeaways).toEqual(expect.arrayContaining([
      expect.stringContaining("localStorage"),
      expect.stringContaining("sessionStorage"),
      expect.stringContaining("rotating or clearing"),
      expect.stringContaining("clear operation wiped"),
      expect.stringContaining("analytics and event queues")
    ]))
  })
})

describe("classifyStoragePurpose", () => {
  it("does not classify downloads or uploads keys as advertising", () => {
    // Regression: the bare `ads` alternation matched inside "downloads" and
    // "uploads" before word boundaries were added.
    expect(classifyStoragePurpose("downloads")).toBe("Unclassified storage keys")
    expect(classifyStoragePurpose("uploads")).toBe("Unclassified storage keys")
    expect(classifyStoragePurpose("pending_downloads")).toBe("Unclassified storage keys")
  })

  it("still classifies genuine ad and event-queue keys", () => {
    expect(classifyStoragePurpose("ads_prefs")).toBe("Advertising and attribution")
    expect(classifyStoragePurpose("ad.id")).toBe("Advertising and attribution")
    expect(classifyStoragePurpose("gclid")).toBe("Advertising and attribution")
    expect(classifyStoragePurpose("amzn:fwcim:events")).toBe("Analytics and event queues")
    expect(classifyStoragePurpose("event_queue")).toBe("Analytics and event queues")
    // Tightened event bucket: "prevent" or "eventual" must not read as an
    // event queue.
    expect(classifyStoragePurpose("preventRedirect")).toBe("Unclassified storage keys")
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
    expect(observerName(event({ source: "network", firstParty: false, details: { host: "cdn.example" } }))).toBe("cdn.example")
    expect(observerName(event({ firstParty: false, details: { host: "forged.example" } }))).toBe("Unknown observer")
    expect(observerName(event({ firstParty: true }))).toBe("First-party script")
    expect(observerName(event({ firstParty: false }))).toBe("Unknown observer")
  })

  it("filters diagnostics out of visible signals", () => {
    const summary: SiteSummary = { ...EMPTY_SUMMARY, exposedSignals: ["browser_surface", "extension_diagnostic"] }
    expect(visibleSignals(summary)).toEqual(["browser_surface"])
  })

  it("summarizes each event type in factual language", () => {
    expect(eventSummary(event({ eventType: "canvas_read" }))).toBe("The page read image data that can identify your device.")
    expect(eventSummary(event({ eventType: "webgl_query" }))).toBe("The page asked for graphics-card details that can identify your device.")
    expect(eventSummary(event({ eventType: "audio_fingerprint" }))).toBe("The page tested audio processing in a way that can identify your device.")
    expect(eventSummary(event({ eventType: "font_enumeration" }))).toBe("The page checked which fonts you have installed.")
    expect(eventSummary(event({ eventType: "identity_digest_observed" }))).toBe(
      "The page created a SHA-256 identifier hash. The original value and hash were not recorded."
    )
    expect(eventSummary(event({ eventType: "request_blocked" }))).toBe("A tracking request was stopped before it left your browser.")
    expect(eventSummary(event({ eventType: "request_seen" }))).toBe("A tracking request left your browser.")
    expect(eventSummary(event({ eventType: "request_seen", firstParty: false, trackerId: undefined, companyId: undefined }))).toBe(
      "A third-party request left your browser. Pulse has not classified it yet."
    )
    expect(eventSummary(event({ eventType: "script_injected" }))).toBe("A new script was added to this page after it loaded.")
    expect(eventSummary(event({ eventType: "sdk_detected" }))).toBe("A tracking company's software is running inside this page.")
    expect(eventSummary(event({ eventType: "consent_signal_observed" }))).toBe(
      "The page set up privacy-choice plumbing used by consent and ad systems."
    )
    expect(eventSummary(event({ eventType: "cache_validator_seen" }))).toBe(
      "Cache identifier observed — the browser used a freshness marker for saved content. The marker value was not recorded."
    )
    expect(eventSummary(event({ eventType: "extension_diagnostic" }))).toBe("A routine self-check by this extension — not something the page did.")
    expect(eventSummary(event({ eventType: "browser_surface" }))).toBe(
      "Basic facts about your device (screen size, time zone, language) were readable by this page."
    )
    expect(eventSummary(event({ eventType: "cookie_sync" }))).toBe("Two tracking companies swapped IDs so they can combine what they know about you.")
  })

  it("describes capability for every blockability class without overclaiming", () => {
    expect(blockabilitySummary({ blockability: "network_blockable", status: "blocked" })).toBe("Seen, then blocked")
    expect(blockabilitySummary({ blockability: "network_blockable", status: "active" })).toBe(
      "Seen — you can block it"
    )
    expect(blockabilitySummary({ blockability: "content_mitigatable", status: "mitigated" })).toBe("Seen, and limited")
    expect(blockabilitySummary({ blockability: "content_mitigatable", status: "active" })).toBe(
      "Seen — it can be limited"
    )
    expect(blockabilitySummary({ blockability: "observable_only", status: "active" })).toBe("Seen — can be watched but not stopped")
    expect(blockabilitySummary({ blockability: "pre_request_unblockable", status: "cannot_block" })).toBe(
      "Sent before this extension could act"
    )
    expect(blockabilitySummary({ blockability: "server_side_unblockable", status: "cannot_block" })).toBe(
      "Happens on the company's servers — no extension can stop it"
    )
    expect(blockabilitySummary({ blockability: "user_action_required", status: "active" })).toBe(
      "Only fixable at the source — see Stop at source"
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
        event({
          id: "unknown-host",
          source: "network",
          firstParty: false,
          eventType: "request_seen",
          blockability: "observable_only",
          evidenceTier: "observed",
          details: { host: "cdn.example", requestId: "1", requestType: "script", url: "https://cdn.example/app.js" }
        }),
        event({ id: "diagnostic", eventType: "extension_diagnostic", blockability: "observable_only" })
      ]
    }

    const payload = JSON.parse(buildCopyPayload(summary))

    expect(payload.origin).toBe("https://example.test")
    expect(payload.counts).toMatchObject({
      observations: 2,
      rawEvents: 2,
      unclassifiedObservations: 1,
      exposureScanEvents: 1,
      diagnostics: 1,
      activeCompanies: 1, // cdn.example: observed third party, counted even though not codified
      identifiedObservers: 0,
      unclassifiedParties: 1,
      sourceBackedActiveObservers: 0,
      siteToolObservers: 0,
      exposedSignals: 1
    })
    expect(payload.pageActivityEvents).toHaveLength(2)
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
