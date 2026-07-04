import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import type { ObserverEvent, SiteSummary } from "~core/domain/types"
import { buildCopyPayload, EMPTY_SUMMARY } from "~core/report/display"
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
    blockability: "network_blockable",
    status: "active",
    confidence: "confirmed",
    evidence: ["Request matched tracker domain."],
    ...overrides
  }
}

const summary: SiteSummary = {
  ...EMPTY_SUMMARY,
  origin: "https://example.test",
  tabId: 1,
  activeCompanies: ["a", "b"],
  blockedCompanies: ["c"],
  cannotBlockSignals: [],
  events: [
    event({ id: "seen-1", trackerId: "meta-pixel", companyId: "meta" }),
    event({ id: "seen-2", trackerId: "meta-pixel", companyId: "meta", observedAt: 200 }),
    event({ id: "seen-3", trackerId: "fullstory", companyId: "fullstory" }),
    event({ id: "exposure", source: "extension-scan", eventType: "browser_surface", blockability: "observable_only", firstParty: true }),
    event({ id: "diag", source: "content", eventType: "extension_diagnostic", blockability: "observable_only", firstParty: true })
  ]
}

describe("summaryMetrics — the single source of truth for headline numbers", () => {
  it("computes each metric per its documented definition", () => {
    const metrics = summaryMetrics(summary)
    expect(metrics.observations).toBe(3) // meta grouped (2→1) + fullstory + exposure scan
    expect(metrics.recordedEvents).toBe(3) // 3 seen; excludes diagnostic and exposure scan
    expect(metrics.exposureEvents).toBe(1)
    expect(metrics.watchingCompanies).toBe(2)
    expect(metrics.blockedCompanies).toBe(1)
    expect(metrics.diagnostics).toBe(1)
  })

  it("agrees with the copy payload — every surface shows the same numbers", () => {
    const payload = JSON.parse(buildCopyPayload(summary))
    const metrics = summaryMetrics(summary)
    expect(payload.counts.observations).toBe(metrics.observations)
    expect(payload.counts.rawEvents).toBe(metrics.recordedEvents)
    expect(payload.counts.exposureScanEvents).toBe(metrics.exposureEvents)
    expect(payload.counts.diagnostics).toBe(metrics.diagnostics)
    expect(payload.counts.activeCompanies).toBe(metrics.watchingCompanies)
    expect(payload.counts.blockedCompanies).toBe(metrics.blockedCompanies)
  })

  it("forbids UI surfaces from computing headline counts inline", () => {
    // The popup/report incongruence happened because each surface did its
    // own arithmetic under shared labels. UI files must read summaryMetrics;
    // any inline count re-derivation is a contract violation.
    const root = resolve(__dirname, "../../..")
    const banned = [/summary\.events\.length/, /summary\.activeCompanies\.length/, /summary\.blockedCompanies\.length/, /summary\.cannotBlockSignals\.length/, /summary\.events\.filter\([^)]*isDiagnosticEvent/]
    for (const file of ["src/popup.tsx", "src/tabs/report.tsx"]) {
      const source = readFileSync(resolve(root, file), "utf8")
      for (const pattern of banned) {
        expect(pattern.test(source), `${file} must not compute headline counts inline (${pattern})`).toBe(false)
      }
    }
  })
})
