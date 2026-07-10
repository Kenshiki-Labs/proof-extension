import type { ObserverEvent } from "~core/domain/types"
import { formatUsd, formatUsdRange, getTrackerServes, MONETIZATION_FLOW_LABELS, rollupObservedValuations, SERVES_LABELS } from "~core/domain/valuation"
import { TYPE, UI } from "~components/system/tokens"

import { Metric, SectionTitle } from "~components/report/shared"

// Estimated value model (docs/TRACKER_VALUE_SPEC.md). Revenue and operator
// cost are shown separately and every figure is labeled as an estimate — no
// false certainty, no single conflated number.
const ESTIMATED_VALUE_EXPLAINER =
  "This is a supply-chain estimate, not a payout. Advertiser money enters through ad rails; site-paid fees enter through publisher tools; identity and measurement data can feed future auctions. You are observed, not paid."

export default function ValuationSection({ embedded = false, events }: { embedded?: boolean; events: ObserverEvent[] }) {
  const rollup = rollupObservedValuations(events)
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
        <Metric label="This visit" value={formatUsd(rollup.thisVisitUsd)} />
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left">
          <thead>
            <tr className={TYPE.small}>
              <th className="p-2">Tracker</th>
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
                <td className={`${TYPE.small} p-2`}>{MONETIZATION_FLOW_LABELS[value.monetizationFlow]}</td>
                <td className={`${TYPE.small} p-2`}>{(() => { const serves = getTrackerServes(trackerId); return serves ? SERVES_LABELS[serves.category] : "—" })()}</td>
                <td className={`${TYPE.body} p-2`}>
                  {value.valueType === "cost" && value.annual.high_usd === 0
                    ? "$0 (free tool)"
                    : formatUsdRange(value.annual.low_usd, value.annual.high_usd)}
                </td>
                <td className={`${TYPE.small} p-2`}>{formatUsd(value.perVisit.dollars)}</td>
                <td className={`${TYPE.small} p-2`}>{value.valueNote} ({value.confidence}: {value.sourceNote})</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
