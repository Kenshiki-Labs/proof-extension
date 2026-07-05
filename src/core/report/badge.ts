import type { SiteSummary } from "~core/domain/types"
import { summaryMetrics } from "~core/report/metrics"

export function badgeTextForEventCount(count: number) {
  if (count <= 0) return ""
  if (count > 99) return "99+"
  return String(count)
}

export function badgeTextForSummary(summary: SiteSummary) {
  return badgeTextForEventCount(summaryMetrics(summary).recordedEvents)
}
