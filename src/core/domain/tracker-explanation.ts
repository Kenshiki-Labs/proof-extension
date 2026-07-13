import type { TrackerRecord } from "~core/contracts/schemas"

export type TrackerExplanation = {
  displayName: string
  plainSummary: string
  observedData: string[]
  siteProvidedData: string[]
  notVisibleToExtension: string[]
  whyItMatters: string[]
  riskLevel: "low" | "medium" | "high"
  riskReasons: string[]
  whatBlockingChanges: string[]
  whatBlockingDoesNotChange: string[]
}

export function getTrackerExplanation(tracker: TrackerRecord): TrackerExplanation {
  return {
    displayName: tracker.displayName ?? tracker.id,
    plainSummary: tracker.userImpact?.plainSummary ?? `${tracker.id} matched a known ${tracker.category} tracker record.`,
    observedData: tracker.observes?.browserVisible ?? tracker.collects,
    siteProvidedData: tracker.observes?.siteProvided ?? [],
    notVisibleToExtension: tracker.observes?.notVisibleToExtension ?? [],
    whyItMatters: tracker.userImpact?.whyItMatters ?? tracker.monetization,
    riskLevel: tracker.userImpact?.riskLevel ?? "medium",
    riskReasons: tracker.userImpact?.riskReasons ?? tracker.monetization,
    whatBlockingChanges: tracker.browserAction.whatBlockingChanges,
    whatBlockingDoesNotChange: tracker.browserAction.whatBlockingDoesNotChange
  }
}
