import type { SiteSummary } from "~core/domain/types"
import { summaryMetrics } from "~core/report/metrics"

export function badgeTextForEventCount(count: number) {
  if (count <= 0) return ""
  if (count > 99) return "99+"
  return String(count)
}

// The badge is the most-glanced surface — always visible on the toolbar — so
// it must show the SAME number the popup leads with: distinct watchers on this
// page (docs/surface-contract.md headline). Showing raw recordedEvents here
// (96) while the popup says "29 watchers" is exactly the two-denominators-
// under-one-glance incoherence the counting layer exists to prevent.
export function badgeTextForSummary(summary: SiteSummary) {
  return badgeTextForEventCount(summaryMetrics(summary).watchingCompanies)
}
