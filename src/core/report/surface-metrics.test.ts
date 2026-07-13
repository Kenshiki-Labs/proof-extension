import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import type { SummaryMetrics } from "./metrics"
import { DEBUG_METRICS, metricItems } from "./surface-metrics"

const metrics: SummaryMetrics = {
  observations: 18,
  recordedEvents: 99,
  exposureEvents: 0,
  watchingCompanies: 8,
  identifiedObservers: 4,
  unclassifiedParties: 4,
  privacyTradeObservers: 2,
  sourceBackedActiveObservers: 4,
  siteToolObservers: 2,
  blockedCompanies: 0,
  mitigatedCompanies: 0,
  cannotBlockSignals: 0,
  unclassifiedObservations: 4,
  persistenceObservations: 7,
  localPageSignals: 2,
  diagnostics: 1,
  storedEvents: 100
}

describe("debug metric catalog", () => {
  it("covers every SummaryMetrics field exactly once — fail-open means nothing is missing", () => {
    const catalogFields = DEBUG_METRICS.map((definition) => definition.field)
    expect(new Set(catalogFields).size).toBe(catalogFields.length)
    expect([...catalogFields].sort()).toEqual(Object.keys(metrics).sort())
  })

  it("renders values straight from summaryMetrics", () => {
    const rendered = metricItems(metrics, DEBUG_METRICS)
    for (const item of rendered) {
      expect(item.value).toBe(metrics[item.field])
    }
  })

  it("keeps metric tiles out of the product surfaces — glance and story render no catalogs", () => {
    // docs/surface-contract.md: the popup's and report's numbers arrive
    // through the verdict sentence, watcher list, and act prose — never
    // through metric tile grids. Only the debug view reads this catalog.
    const root = resolve(__dirname, "../../..")
    const popup = readFileSync(resolve(root, "src/popup.tsx"), "utf8")
    const report = readFileSync(resolve(root, "src/tabs/report.tsx"), "utf8")

    expect(popup).not.toContain("surface-metrics")
    expect(popup).not.toContain("summaryMetrics")
    expect(report).not.toContain("REPORT_SUMMARY_METRICS")
  })
})
