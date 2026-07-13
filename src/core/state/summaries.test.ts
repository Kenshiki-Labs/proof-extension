import { describe, expect, it } from "vitest"

import type { ObserverEvent, PageError } from "~core/domain/types"

import {
  annotateEventDetail,
  createEmptySiteSummary,
  normalizeSiteSummary,
  pruneExpiredEvents,
  recordPageError,
  supersedeEvent,
  upsertEvent
} from "./summaries"

function event(overrides: Partial<ObserverEvent> = {}): ObserverEvent {
  return {
    id: "event-1",
    tabId: 1,
    origin: "https://example.test",
    observedAt: 1,
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

describe("upsertEvent", () => {
  it("rolls observer events into status-specific summary buckets", () => {
    const summary = upsertEvent(createEmptySiteSummary("https://example.test", 1), event())

    expect(summary.incomplete).toBe(false)
    expect(summary.activeCompanies).toEqual(["https://example.test"])
    expect(summary.exposedSignals).toEqual(["canvas_read"])
  })

  it("keeps extension-scan events out of page-observation summary buckets", () => {
    const summary = upsertEvent(
      createEmptySiteSummary("https://example.test", 1),
      event({
        id: "browser-surface",
        source: "extension-scan",
        eventType: "browser_surface",
        blockability: "observable_only",
        confidence: "confirmed",
        evidence: ["Browser APIs exposed passive surface fields to the extension scan."]
      })
    )

    expect(summary.activeCompanies).toEqual([])
    expect(summary.exposedSignals).toEqual([])
    expect(summary.events).toHaveLength(1)
  })

  it("replaces existing events by id", () => {
    const first = upsertEvent(createEmptySiteSummary("https://example.test", 1), event())
    const second = upsertEvent(first, event({ status: "mitigated" }))

    expect(second.events).toHaveLength(1)
    expect(second.mitigatedCompanies).toEqual(["https://example.test"])
    expect(second.activeCompanies).toEqual([])
  })

  it("caps retained events per tab", () => {
    const first = upsertEvent(createEmptySiteSummary("https://example.test", 1), event({ id: "event-1" }), 2)
    const second = upsertEvent(first, event({ id: "event-2", eventType: "webgl_query" }), 2)
    const third = upsertEvent(second, event({ id: "event-3", eventType: "audio_fingerprint" }), 2)

    expect(third.events.map((item) => item.id)).toEqual(["event-2", "event-3"])
    expect(third.exposedSignals).toEqual(["webgl_query", "audio_fingerprint"])
  })

  it("uses tracker keys for attributed non-first-party events without promoting unclassified hosts into companies", () => {
    const first = upsertEvent(
      createEmptySiteSummary("https://example.test", 1),
      event({ firstParty: false, status: "blocked", trackerId: "fullstory" })
    )
    const second = upsertEvent(first, event({ firstParty: false, id: "event-2", status: "cannot_block" }))

    expect(second.blockedCompanies).toEqual(["fullstory"])
    expect(second.activeCompanies).toEqual([])
    expect(second.cannotBlockSignals).toEqual(["canvas_read"])
  })

  it("keeps unclassified third-party request evidence without counting it as a known watcher", () => {
    const summary = upsertEvent(
      createEmptySiteSummary("https://example.test", 1),
      event({
        id: "request_unclassified:1:abc:cdn.example",
        source: "network",
        firstParty: false,
        eventType: "request_seen",
        blockability: "observable_only",
        confidence: "confirmed",
        evidenceTier: "observed",
        evidence: ["Third-party request observed to cdn.example; no tracker record matched it."],
        details: { host: "cdn.example", requestId: "abc", requestType: "script", url: "https://cdn.example/app.js" }
      })
    )

    expect(summary.events).toHaveLength(1)
    expect(summary.activeCompanies).toEqual([])
    expect(summary.exposedSignals).toEqual(["request_seen"])
  })

  it("keeps local page signals out of active company buckets", () => {
    const first = upsertEvent(
      createEmptySiteSummary("https://example.test", 1),
      event({
        id: "consent",
        eventType: "consent_signal_observed",
        blockability: "observable_only",
        evidenceTier: "observed",
        details: { global: "__tcfapi" }
      })
    )
    const summary = upsertEvent(
      first,
      event({
        id: "digest",
        eventType: "identity_digest_observed",
        blockability: "observable_only",
        evidenceTier: "observed",
        policyLabel: "behavioral_profiling",
        details: { algorithm: "SHA-256", inputBytes: 19 }
      })
    )

    expect(summary.activeCompanies).toEqual([])
    expect(summary.exposedSignals).toEqual(["consent_signal_observed", "identity_digest_observed"])
  })

  it("evicts unclassified host noise before classified tracker evidence when capped", () => {
    function unclassified(id: string, host: string): ObserverEvent {
      return event({
        id,
        source: "network",
        firstParty: false,
        eventType: "request_seen",
        blockability: "observable_only",
        evidenceTier: "observed",
        evidence: [`Third-party request observed to ${host}; no tracker record matched it.`],
        details: { host, requestId: id, requestType: "script", url: `https://${host}/x.js` }
      })
    }

    const classified = event({
      id: "request_seen:1:1:fullstory",
      source: "network",
      firstParty: false,
      trackerId: "fullstory",
      companyId: "fullstory",
      eventType: "request_seen",
      blockability: "network_blockable",
      evidence: ["Request matched FullStory domain."]
    })

    let summary = upsertEvent(createEmptySiteSummary("https://example.test", 1), classified, 3)
    summary = upsertEvent(summary, unclassified("request_unclassified:1:a.example", "a.example"), 3)
    summary = upsertEvent(summary, unclassified("request_unclassified:1:b.example", "b.example"), 3)
    summary = upsertEvent(summary, unclassified("request_unclassified:1:c.example", "c.example"), 3)

    expect(summary.events).toHaveLength(3)
    expect(summary.events.map((item) => item.id)).toContain("request_seen:1:1:fullstory")
    expect(summary.events.map((item) => item.id)).not.toContain("request_unclassified:1:a.example")
    expect(summary.activeCompanies).toEqual(["fullstory"])
  })

  it("prefers explicit company ids when rebuilding summary buckets", () => {
    const summary = upsertEvent(
      createEmptySiteSummary("https://example.test", 1),
      event({ companyId: "google", firstParty: false, source: "network", trackerId: "google-analytics" })
    )

    expect(summary.activeCompanies).toEqual(["google"])
  })
})

describe("normalizeSiteSummary", () => {
  it("fills missing fields from legacy stored summaries", () => {
    expect(normalizeSiteSummary({}, "https://example.test", 7)).toMatchObject({
      origin: "https://example.test",
      tabId: 7,
      activeCompanies: [],
      blockedCompanies: [],
      mitigatedCompanies: [],
      exposedSignals: [],
      cannotBlockSignals: [],
      events: [],
      pageErrors: [],
      incomplete: true
    })
  })

  it("preserves fields from current stored summaries", () => {
    const current = createEmptySiteSummary("https://stored.test", 2)
    const normalized = normalizeSiteSummary({ ...current, incomplete: false, updatedAt: 123 }, "https://fallback.test", 9)

    expect(normalized).toEqual({ ...current, incomplete: false, updatedAt: 123 })
  })

  it("rebuilds stored summary buckets from events so stale counts cannot leak into the UI", () => {
    const stored = {
      ...createEmptySiteSummary("https://stored.test", 2),
      activeCompanies: ["stale-company"],
      blockedCompanies: ["stale-blocked"],
      exposedSignals: ["stale_signal"],
      cannotBlockSignals: ["stale_cannot_block"],
      events: [
        event({
          id: "request_unclassified:2:abc:cdn.example",
          tabId: 2,
          origin: "https://stored.test",
          source: "network",
          firstParty: false,
          eventType: "request_seen",
          blockability: "observable_only",
          evidenceTier: "observed",
          details: { host: "cdn.example", requestId: "abc", requestType: "script", url: "https://cdn.example/app.js" }
        })
      ],
      incomplete: false,
      updatedAt: 123
    }

    const normalized = normalizeSiteSummary(stored, "https://fallback.test", 9)

    expect(normalized.activeCompanies).toEqual([])
    expect(normalized.blockedCompanies).toEqual([])
    expect(normalized.exposedSignals).toEqual(["request_seen"])
    expect(normalized.cannotBlockSignals).toEqual([])
    expect(normalized.events).toEqual(stored.events)
    expect(normalized.updatedAt).toBe(123)
  })

  it("restores source-backed watcher counts from events when stored buckets are missing or wrong", () => {
    const stored = {
      ...createEmptySiteSummary("https://stored.test", 2),
      activeCompanies: [],
      events: [
        event({
          id: "request_seen:2:abc:fullstory",
          tabId: 2,
          origin: "https://stored.test",
          source: "network",
          firstParty: false,
          trackerId: "fullstory",
          companyId: "fullstory",
          eventType: "request_seen",
          blockability: "network_blockable",
          evidence: ["Request matched FullStory domain."]
        })
      ],
      incomplete: false,
      updatedAt: 456
    }

    const normalized = normalizeSiteSummary(stored, "https://fallback.test", 9)

    expect(normalized.activeCompanies).toEqual(["fullstory"])
    expect(normalized.exposedSignals).toEqual(["request_seen"])
    expect(normalized.updatedAt).toBe(456)
  })
})

describe("pruneExpiredEvents", () => {
  it("returns the same summary when every event is inside retention", () => {
    const summary = upsertEvent(createEmptySiteSummary("https://example.test", 1), event({ observedAt: 1000 }))

    expect(pruneExpiredEvents(summary, 1, 2000)).toBe(summary)
  })

  it("drops expired events and rebuilds derived summary fields", () => {
    const now = 10 * 24 * 60 * 60 * 1000
    const first = upsertEvent(
      createEmptySiteSummary("https://example.test", 1),
      event({ id: "expired", observedAt: 1, status: "blocked", trackerId: "fullstory" })
    )
    const second = upsertEvent(first, event({ id: "fresh", observedAt: now, status: "active" }))
    const pruned = pruneExpiredEvents(second, 1, now)

    expect(pruned.events.map((item) => item.id)).toEqual(["fresh"])
    expect(pruned.blockedCompanies).toEqual([])
    expect(pruned.activeCompanies).toEqual(["https://example.test"])
  })
})

describe("recordPageError", () => {
  function pageError(id: string): PageError {
    return { id, message: `Error ${id}`, observedAt: Number(id.replace("error-", "")) }
  }

  it("retains recent page errors without changing event buckets", () => {
    const summary = upsertEvent(createEmptySiteSummary("https://example.test", 1), event())
    const withError = recordPageError(summary, pageError("error-1"))

    expect(withError.pageErrors).toEqual([pageError("error-1")])
    expect(withError.events).toEqual(summary.events)
    expect(withError.activeCompanies).toEqual(summary.activeCompanies)
  })

  it("caps retained page errors", () => {
    const summary = createEmptySiteSummary("https://example.test", 1)
    const withErrors = ["error-1", "error-2", "error-3"].reduce((current, id) => recordPageError(current, pageError(id), 2), summary)

    expect(withErrors.pageErrors.map((item) => item.id)).toEqual(["error-2", "error-3"])
  })

  it("ignores generic uncaught page errors without actionable detail", () => {
    const summary = createEmptySiteSummary("https://example.test", 1)
    const withError = recordPageError(summary, { id: "error-1", message: "Uncaught error", observedAt: 1 })

    expect(withError).toBe(summary)
  })
})
describe("supersedeEvent", () => {
  it("removes a superseded seen-event so a blocked company is not also watching", () => {
    const seen: ObserverEvent = {
      id: "request_seen:1:42:fullstory",
      tabId: 1,
      origin: "https://example.test",
      observedAt: 100,
      source: "network",
      trackerId: "fullstory",
      companyId: "fullstory",
      firstParty: false,
      eventType: "request_seen",
      blockability: "network_blockable",
      status: "active",
      confidence: "confirmed",
      evidence: ["Request matched FullStory domain."]
    }
    const blocked: ObserverEvent = {
      ...seen,
      id: "request_blocked:1:42:fullstory",
      eventType: "request_blocked",
      status: "blocked"
    }

    let summary = upsertEvent(createEmptySiteSummary("https://example.test", 1), seen)
    expect(summary.activeCompanies).toContain("fullstory")

    summary = upsertEvent(supersedeEvent(summary, seen.id), blocked)
    expect(summary.blockedCompanies).toContain("fullstory")
    expect(summary.activeCompanies).not.toContain("fullstory")
    expect(summary.events.map((event) => event.id)).toEqual(["request_blocked:1:42:fullstory"])
  })

  it("returns the same summary when nothing matches", () => {
    const summary = createEmptySiteSummary("https://example.test", 1)
    expect(supersedeEvent(summary, "missing")).toBe(summary)
  })
})

describe("annotateEventDetail", () => {
  it("updates one detail key without changing the event count", () => {
    const blocked = event({
      id: "request_blocked:1:42:fullstory",
      source: "network",
      firstParty: false,
      trackerId: "fullstory",
      eventType: "request_blocked",
      status: "blocked",
      details: { requestId: "42", blockSignals: "rule_matched_debug" }
    })

    const summary = upsertEvent(createEmptySiteSummary("https://example.test", 1), blocked)
    const annotated = annotateEventDetail(summary, blocked.id, "blockSignals", "err_blocked_by_client,rule_matched_debug")

    const stored = annotated.events.find((item) => item.id === blocked.id)
    expect(stored?.details?.blockSignals).toBe("err_blocked_by_client,rule_matched_debug")
    expect(stored?.count ?? 1).toBe(1)
    expect(stored?.details?.requestId).toBe("42")
  })

  it("returns the same summary when the event is missing or the value is unchanged", () => {
    const summary = upsertEvent(createEmptySiteSummary("https://example.test", 1), event({ details: { blockSignals: "x" } }))

    expect(annotateEventDetail(summary, "missing", "blockSignals", "x")).toBe(summary)
    expect(annotateEventDetail(summary, "event-1", "blockSignals", "x")).toBe(summary)
  })
})
