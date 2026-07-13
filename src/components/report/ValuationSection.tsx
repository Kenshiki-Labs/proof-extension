import { Metric, SectionTitle } from "~components/report/shared"
import { TYPE, UI } from "~components/system/tokens"
import type { ObserverEvent } from "~core/domain/types"
import {
  formatUsd,
  formatUsdRange,
  getTrackerServes,
  MONETIZATION_FLOW_LABELS,
  rollupObservedValuations,
  rollupValuationOutcomes,
  SERVES_LABELS,
  type TrackerOutcome,
  type ValuationOutcomeRollup,
  type ValuationRollup
} from "~core/domain/valuation"
import { calibratedAnnualUsd, type VisitFrequency } from "~core/domain/visit-frequency"

// "Mitigated" matches the watcher list's toggle and the page marker — one
// user-facing word per intervention across every surface.
const OUTCOME_LABELS: Record<TrackerOutcome, string> = {
  reached: "Reached them",
  shimmed: "Mitigated",
  denied: "Blocked"
}

// Estimated value model (docs/TRACKER_VALUE_SPEC.md). Revenue and operator
// cost are shown separately and every figure is labeled as an estimate — no
// false certainty, no single conflated number.
const ESTIMATED_VALUE_EXPLAINER =
  "This is a supply-chain estimate, not a payout. Advertiser money enters through ad rails; site-paid fees enter through publisher tools; identity and measurement data can feed future auctions. You are observed, not paid."

export default function ValuationSection({
  embedded = false,
  events,
  frequency = null,
  outcomes: outcomesProp,
  rollup: rollupProp
}: {
  embedded?: boolean
  events: ObserverEvent[]
  // The user's stated visit rate for this domain, when they've answered:
  // personal claims ("your blocks") calibrate to it; sourced averages don't.
  frequency?: VisitFrequency | null
  // Pass the model's memoized rollups where available (the report does);
  // computed locally only as a fallback so the component stays droppable.
  outcomes?: ValuationOutcomeRollup
  rollup?: ValuationRollup
}) {
  const rollup = rollupProp ?? rollupObservedValuations(events)
  const outcomes = outcomesProp ?? rollupValuationOutcomes(events)
  const outcomeByTracker = new Map<string, TrackerOutcome>()
  for (const outcome of ["reached", "shimmed", "denied"] as const) {
    for (const trackerId of outcomes[outcome].trackerIds) outcomeByTracker.set(trackerId, outcome)
  }
  const anythingStopped = outcomes.denied.trackerIds.length > 0 || outcomes.shimmed.trackerIds.length > 0
  if (rollup.perTracker.length === 0) return null

  return (
    <section className={embedded ? "mt-4" : `mt-6 ${UI.panel} ${UI.reportInset}`}>
      {embedded ? null : <SectionTitle number="03b" title="Estimated data value" />}
      <p className={`${TYPE.body} mt-2 max-w-4xl`}>{ESTIMATED_VALUE_EXPLAINER}</p>
      <p className={`${TYPE.small} mt-2`}>{rollup.disclaimer}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Metric
          label={`Ad-market value to trackers/yr (${rollup.revenueTrackerCount} ${rollup.revenueTrackerCount === 1 ? "tracker" : "trackers"})`}
          value={formatUsdRange(rollup.annualRevenueLowUsd, rollup.annualRevenueHighUsd)}
        />
        <Metric
          label={`Site-paid tool fees/yr (${rollup.costTrackerCount} ${rollup.costTrackerCount === 1 ? "tool" : "tools"})`}
          value={formatUsdRange(rollup.annualOperatorCostLowUsd, rollup.annualOperatorCostHighUsd)}
        />
        <Metric label={anythingStopped ? "This visit, reached them" : "This visit"} value={formatUsd(outcomes.reached.thisVisitUsd)} />
      </div>
      {anythingStopped ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {outcomes.denied.trackerIds.length > 0 ? (
            <Metric
              description={(() => {
                // "Your blocks" is a personal claim: it uses the user's stated
                // visit rate when they've given one, and revenue-type value
                // only — cost-type trackers are fees the site pays, so
                // blocking one saves the site money, not the user.
                const calibrated = frequency
                  ? calibratedAnnualUsd(outcomes.denied.annualRevenueLowUsd, outcomes.denied.annualRevenueHighUsd, frequency)
                  : null
                const requests = `${outcomes.denied.requestCount} blocked ${outcomes.denied.requestCount === 1 ? "request" : "requests"}`
                const costNote = outcomes.denied.costTrackerCount > 0 ? " · site-paid tools not counted here" : ""
                if (calibrated !== null)
                  return `${requests} · est. ${formatUsd(calibrated)}/yr at your stated visit rate, if your blocks hold${costNote}`
                if (outcomes.denied.annualRevenueHighUsd > 0)
                  return `${requests} · est. ${formatUsdRange(outcomes.denied.annualRevenueLowUsd, outcomes.denied.annualRevenueHighUsd)}/yr for an average visitor, if your blocks hold${costNote}`
                return `${requests} · blocks site-paid tools; the fees saved go to the site, not you`
              })()}
              label={`Denied by your blocks (${outcomes.denied.trackerIds.length} ${outcomes.denied.trackerIds.length === 1 ? "watcher" : "watchers"})`}
              tone="signal"
              value={formatUsd(outcomes.denied.thisVisitRevenueUsd)}
            />
          ) : null}
          {outcomes.shimmed.trackerIds.length > 0 ? (
            <Metric
              description={`${outcomes.shimmed.requestCount} ${outcomes.shimmed.requestCount === 1 ? "request" : "requests"} answered locally — they got a reply, not your data${outcomes.shimmed.costTrackerCount > 0 ? " · site-paid tools not counted here" : ""}`}
              label={`Mitigated locally (${outcomes.shimmed.trackerIds.length} ${outcomes.shimmed.trackerIds.length === 1 ? "watcher" : "watchers"})`}
              tone="signal"
              value={formatUsd(outcomes.shimmed.thisVisitRevenueUsd)}
            />
          ) : null}
        </div>
      ) : null}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left">
          <thead>
            <tr className={TYPE.small}>
              <th className="p-2">Tracker</th>
              <th className="p-2">Outcome</th>
              <th className="p-2">Model</th>
              <th className="p-2">Who it serves</th>
              <th className="p-2">Annual estimate</th>
              <th className="p-2">This visit</th>
              <th className="p-2">Basis</th>
            </tr>
          </thead>
          <tbody>
            {rollup.perTracker.map(({ trackerId, value }) => (
              <tr className="border-t border-border align-top" key={trackerId}>
                <td className={`${TYPE.body} p-2`}>{trackerId}</td>
                <td
                  className={`${TYPE.small} p-2 ${outcomeByTracker.get(trackerId) === "reached" || !outcomeByTracker.has(trackerId) ? "" : "text-signal"}`}>
                  {OUTCOME_LABELS[outcomeByTracker.get(trackerId) ?? "reached"]}
                </td>
                <td className={`${TYPE.small} p-2`}>{MONETIZATION_FLOW_LABELS[value.monetizationFlow]}</td>
                <td className={`${TYPE.small} p-2`}>
                  {(() => {
                    const serves = getTrackerServes(trackerId)
                    return serves ? SERVES_LABELS[serves.category] : "—"
                  })()}
                </td>
                <td className={`${TYPE.body} p-2`}>
                  {value.valueType === "cost" && value.annual.high_usd === 0
                    ? "$0 (free tool)"
                    : formatUsdRange(value.annual.low_usd, value.annual.high_usd)}
                </td>
                <td className={`${TYPE.small} p-2`}>{formatUsd(value.perVisit.dollars)}</td>
                <td className={`${TYPE.small} p-2`}>
                  {value.valueNote} ({value.confidence}: {value.sourceNote})
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
