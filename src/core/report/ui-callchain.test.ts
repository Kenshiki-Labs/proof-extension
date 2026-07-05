import { describe, expect, it } from "vitest"

import { buildVerdict, rankObservers } from "~core/domain/attention"
import type { ObserverEvent } from "~core/domain/types"
import { createEmptySiteSummary, supersedeEvent, upsertEvent } from "~core/state/summaries"
import { buildAtomicSignalRows, buildCopyPayload, compactEvents, exposureScanEvents, pageActivityEvents, persistenceSurfaceObservations, unclassifiedObservations } from "./display"
import { summaryMetrics } from "./metrics"

function event(overrides: Partial<ObserverEvent>): ObserverEvent {
  return {
    id: "event",
    tabId: 1,
    origin: "https://example.test",
    observedAt: 100,
    source: "network",
    firstParty: false,
    eventType: "request_seen",
    blockability: "observable_only",
    status: "active",
    confidence: "confirmed",
    evidence: ["Observed."],
    evidenceTier: "observed",
    ...overrides
  }
}

function summaryFrom(events: ObserverEvent[]) {
  return events.reduce(
    (summary, item) => upsertEvent(summary, item),
    createEmptySiteSummary("https://example.test", 1)
  )
}

function verdictObserverCount(summary: ReturnType<typeof summaryFrom>) {
  const verdict = buildVerdict(summary)
  return verdict.companiesWatching
}

function copyCounts(summary: ReturnType<typeof summaryFrom>) {
  return JSON.parse(buildCopyPayload(summary)).counts
}

describe("UI callchain integration", () => {
  it("counts observed third-party hosts as watchers even without attribution, but keeps first-party storage out", () => {
    const summary = summaryFrom([
      event({
        id: "request_unclassified:1:cdn.example",
        details: { host: "cdn.example", requestId: "r1", requestType: "script", url: "https://cdn.example/app.js" },
        evidence: ["Third-party request observed to cdn.example; no tracker record matched it."]
      }),
      event({
        id: "storage_write:https://example.test:sessionStorage:set:theme",
        source: "api-hook",
        firstParty: true,
        eventType: "storage_write",
        policyLabel: "unknown_first_party",
        details: { area: "sessionStorage", op: "set", key: "theme", valueBytes: 12 },
        evidence: ["Page script saved a key to storage."]
      }),
      event({
        id: "cache_validator_seen:1:r2:response:etag",
        firstParty: true,
        eventType: "cache_validator_seen",
        details: { direction: "response", headerName: "ETag", host: "example.test", requestId: "r2", requestType: "script" },
        evidence: ["Response used cache validator header ETag for example.test. Header values are never recorded."]
      })
    ])

    const metrics = summaryMetrics(summary)
    // cdn.example is a third party we observed but have not codified — it
    // counts as watching (the observed reality), and shows up as an
    // unclassified party, not an identified one. First-party storage/cache
    // never count as watchers.
    expect(metrics.watchingCompanies).toBe(1)
    expect(metrics.identifiedObservers).toBe(0)
    expect(metrics.unclassifiedParties).toBe(1)
    expect(metrics.blockedCompanies).toBe(0)
    expect(metrics.cannotBlockSignals).toBe(0)
    expect(metrics.unclassifiedObservations).toBe(1)
    expect(metrics.persistenceObservations).toBe(2)

    expect(verdictObserverCount(summary)).toBe(1)
    expect(unclassifiedObservations(summary.events)).toHaveLength(1)
    expect(persistenceSurfaceObservations(summary.events)).toHaveLength(2)

    const copied = JSON.parse(buildCopyPayload(summary))
    expect(copied.counts).toMatchObject({
      activeCompanies: 1,
      identifiedObservers: 0,
      unclassifiedParties: 1,
      unclassifiedObservations: 1,
      persistenceObservations: 2
    })
  })

  it("still lets source-backed tracker observations flow into watcher/verdict counts", () => {
    const summary = summaryFrom([
      event({
        id: "request_seen:1:r1:meta-pixel",
        trackerId: "meta-pixel",
        companyId: "meta",
        blockability: "network_blockable",
        evidenceTier: "actionable",
        evidence: ["Request matched meta-pixel domain connect.facebook.net."]
      }),
      event({
        id: "cache_validator_seen:1:r2:response:etag",
        firstParty: true,
        eventType: "cache_validator_seen",
        details: { direction: "response", headerName: "ETag", host: "example.test", requestId: "r2", requestType: "script" },
        evidence: ["Response used cache validator header ETag for example.test. Header values are never recorded."]
      })
    ])

    const metrics = summaryMetrics(summary)
    expect(metrics.watchingCompanies).toBe(1)
    expect(metrics.persistenceObservations).toBe(1)
    expect(verdictObserverCount(summary)).toBe(1)
  })

  it("keeps popup/report/copy counts consistent for a mixed page summary", () => {
    const summary = summaryFrom([
      event({
        id: "request_seen:1:r1:meta-pixel",
        trackerId: "meta-pixel",
        companyId: "meta",
        blockability: "network_blockable",
        evidenceTier: "actionable",
        evidence: ["Request matched meta-pixel domain connect.facebook.net."]
      }),
      event({
        id: "request_seen:1:r2:fullstory",
        trackerId: "fullstory",
        companyId: "fullstory",
        blockability: "network_blockable",
        evidenceTier: "actionable",
        evidence: ["Request matched fullstory domain edge.fullstory.com."]
      }),
      event({
        id: "request_seen:1:r8:liveramp",
        trackerId: "liveramp",
        companyId: "liveramp",
        blockability: "network_blockable",
        evidenceTier: "actionable",
        evidence: ["Request matched liveramp domain."]
      }),
      event({
        id: "request_unclassified:1:cdn.example",
        details: { host: "cdn.example", requestId: "r3", requestType: "script", url: "https://cdn.example/app.js" },
        evidence: ["Third-party request observed to cdn.example; no tracker record matched it."]
      }),
      event({
        id: "storage_write:https://example.test:localStorage:set:theme",
        source: "api-hook",
        firstParty: true,
        eventType: "storage_write",
        policyLabel: "unknown_first_party",
        details: { area: "localStorage", op: "set", key: "theme", valueBytes: 12 },
        evidence: ["Page script saved a key to storage."]
      }),
      event({
        id: "cache_validator_seen:1:r4:response:etag",
        firstParty: true,
        eventType: "cache_validator_seen",
        details: { direction: "response", headerName: "ETag", host: "example.test", requestId: "r4", requestType: "script" },
        evidence: ["Response used cache validator header ETag for example.test. Header values are never recorded."]
      }),
      event({
        id: "browser-surface",
        source: "extension-scan",
        firstParty: true,
        eventType: "browser_surface",
        policyLabel: "unknown_first_party",
        evidence: ["Browser APIs exposed passive surface fields to the extension scan."]
      }),
      event({
        id: "diagnostic",
        source: "content",
        firstParty: true,
        eventType: "extension_diagnostic",
        policyLabel: "unknown_first_party",
        evidence: ["Proof active-tab scan reached this page."]
      })
    ])

    const metrics = summaryMetrics(summary)
    const counts = copyCounts(summary)
    const verdict = buildVerdict(summary)
    const ranked = rankObservers(summary.events)
    const visibleAllObservedRows = compactEvents(pageActivityEvents(summary.events))

    expect(metrics).toMatchObject({
      observations: 6,
      recordedEvents: 6,
      watchingCompanies: 4, // meta + fullstory + liveramp (named) + cdn.example (observed)
      identifiedObservers: 3,
      unclassifiedParties: 1,
      sourceBackedActiveObservers: 3,
      siteToolObservers: 1,
      blockedCompanies: 0,
      cannotBlockSignals: 0,
      unclassifiedObservations: 1,
      persistenceObservations: 2,
      exposureEvents: 1,
      diagnostics: 1
    })
    expect(counts).toMatchObject({
      activeCompanies: metrics.watchingCompanies,
      identifiedObservers: metrics.identifiedObservers,
      unclassifiedParties: metrics.unclassifiedParties,
      sourceBackedActiveObservers: metrics.sourceBackedActiveObservers,
      siteToolObservers: metrics.siteToolObservers,
      blockedCompanies: metrics.blockedCompanies,
      cannotBlockSignals: metrics.cannotBlockSignals,
      unclassifiedObservations: metrics.unclassifiedObservations,
      persistenceObservations: metrics.persistenceObservations,
      exposureScanEvents: metrics.exposureEvents,
      diagnostics: metrics.diagnostics
    })

    expect(counts.observations).toBe(metrics.observations)
    expect(counts.rawEvents).toBe(metrics.recordedEvents)
    expect(visibleAllObservedRows).toHaveLength(metrics.observations)
    expect(visibleAllObservedRows.some(({ event: item }) => item.source === "extension-scan")).toBe(false)
    expect(verdictObserverCount(summary)).toBe(metrics.watchingCompanies)
    expect(verdict.companiesWatching).toBe(metrics.watchingCompanies)
    expect(verdict.tierCounts).toMatchObject({ red: 1, amber: 1, gray: 1 })
    expect(ranked.map((item) => item.observation.event.trackerId).sort()).toEqual(["fullstory", "liveramp", "meta-pixel"])
    expect(unclassifiedObservations(summary.events).map((item) => item.event.details?.host)).toEqual(["cdn.example"])
    expect(persistenceSurfaceObservations(summary.events).map((item) => item.event.eventType).sort()).toEqual(["cache_validator_seen", "storage_write"])
    expect(exposureScanEvents(summary.events)).toHaveLength(1)
    expect(buildAtomicSignalRows(summary.events).map((row) => row.signal).sort()).toEqual([
      "cache_validator_seen",
      "request_seen",
      "storage_write"
    ])
    expect(compactEvents(summary.events).some(({ event: item }) => item.eventType === "extension_diagnostic")).toBe(false)
  })

  it("keeps blocked and active states consistent when a seen request is superseded", () => {
    const seen = event({
      id: "request_seen:1:r1:fullstory",
      trackerId: "fullstory",
      companyId: "fullstory",
      blockability: "network_blockable",
      evidenceTier: "actionable",
      evidence: ["Request matched fullstory domain edge.fullstory.com."]
    })
    const blocked = event({
      ...seen,
      id: "request_blocked:1:r1:fullstory",
      eventType: "request_blocked",
      status: "blocked",
      evidence: ["Request matched fullstory domain edge.fullstory.com."]
    })

    const withSeen = summaryFrom([seen])
    const summary = upsertEvent(supersedeEvent(withSeen, seen.id), blocked)
    const metrics = summaryMetrics(summary)
    const counts = copyCounts(summary)

    expect(metrics.watchingCompanies).toBe(0)
    expect(metrics.blockedCompanies).toBe(1)
    expect(summary.activeCompanies).toEqual([])
    expect(summary.blockedCompanies).toEqual(["fullstory"])
    expect(counts.activeCompanies).toBe(metrics.watchingCompanies)
    expect(counts.blockedCompanies).toBe(metrics.blockedCompanies)
    expect(compactEvents(summary.events).map(({ event: item }) => item.eventType)).toEqual(["request_blocked"])
  })
})
