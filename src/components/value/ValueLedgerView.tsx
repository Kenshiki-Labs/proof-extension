import { Activity, Building2, CalendarDays, CircleDollarSign, Globe2, MousePointerClick, Radar } from "lucide-react"

import { Metric } from "~components/report/shared"
import { TYPE, UI } from "~components/system/tokens"
import LedgerTables from "~components/value/LedgerTables"
import Methodology, { VALUE_LEDGER_EXPLAINER } from "~components/value/Methodology"
import SupplyChainMap from "~components/value/SupplyChainMap"
import TrackerGraph from "~components/value/TrackerGraph"
import type { RollingValuationSummary, ValuationPeriod } from "~core/domain/types"
import { formatUsd, formatUsdRange, SERVES_LABELS } from "~core/domain/valuation"

export const VALUE_PERIODS: Array<{ label: string; value: ValuationPeriod }> = [
  { label: "Today", value: "day" },
  { label: "7 days", value: "week" },
  { label: "30 days", value: "month" },
  { label: "All", value: "all" }
]

function PeriodSelector({
  onPeriodChange,
  period,
  periods
}: {
  onPeriodChange: (period: ValuationPeriod) => void
  period: ValuationPeriod
  periods: typeof VALUE_PERIODS
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {periods.map((item) => (
        <button
          className={`${UI.segment} ${period === item.value ? UI.segmentActive : UI.segmentIdle}`}
          key={item.value}
          onClick={() => onPeriodChange(item.value)}
          type="button">
          {item.label}
        </button>
      ))}
    </div>
  )
}

function EmptyState({ compact }: { compact: boolean }) {
  return (
    <section className={compact ? "mt-4" : `${UI.panel} ${UI.reportInset}`}>
      <div className={compact ? `${UI.subtlePanel} p-3` : ""}>
        <h2 className={TYPE.label}>Local value ledger</h2>
        <p className={`${TYPE.body} mt-2`}>No tracker presence has been recorded for this period.</p>
      </div>
    </section>
  )
}

export default function ValueLedgerView({
  compact = false,
  onPeriodChange,
  period,
  rollup,
  showMethodology = false
}: {
  compact?: boolean
  onPeriodChange: (period: ValuationPeriod) => void
  period: ValuationPeriod
  rollup: RollingValuationSummary | null
  showMethodology?: boolean
}) {
  const periods = compact ? VALUE_PERIODS.filter((item) => item.value !== "all") : VALUE_PERIODS
  if (!rollup || rollup.trackerCount === 0) return <EmptyState compact={compact} />

  return (
    <>
      <section className={compact ? "mt-4" : `${UI.panel} ${UI.reportInset}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className={TYPE.label}>Local value ledger</h2>
          <PeriodSelector onPeriodChange={onPeriodChange} period={period} periods={periods} />
        </div>
        <p className={`${TYPE.body} mt-2 max-w-4xl`}>{VALUE_LEDGER_EXPLAINER}</p>
        {compact ? (
          <dl className={`mt-2.5 ${UI.subtlePanel} grid grid-cols-[128px_1fr] gap-1.5 p-3`}>
            <dt className={TYPE.small}>Sites</dt>
            <dd className={TYPE.body}>{rollup.siteCount}</dd>
            <dt className={TYPE.small}>Visits</dt>
            <dd className={TYPE.body}>{rollup.visitCount}</dd>
            <dt className={TYPE.small}>Trackers</dt>
            <dd className={TYPE.body}>{rollup.trackerCount}</dd>
            <dt className={TYPE.small}>This period</dt>
            <dd className={TYPE.body}>{formatUsd(rollup.thisPeriodVisitUsd)} observed presence estimate</dd>
            <dt className={TYPE.small}>Ad-market value to trackers/yr</dt>
            <dd className={TYPE.body}>{formatUsdRange(rollup.annualRevenueLowUsd, rollup.annualRevenueHighUsd)}</dd>
            <dt className={TYPE.small}>Site-paid tool fees/yr</dt>
            <dd className={TYPE.body}>{formatUsdRange(rollup.annualOperatorCostLowUsd, rollup.annualOperatorCostHighUsd)}</dd>
          </dl>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              description="Advertiser-funded value captured by tracker and ad-tech companies."
              icon={MousePointerClick}
              label="Ad-market value to trackers/yr"
              tone="amber"
              value={formatUsdRange(rollup.annualRevenueLowUsd, rollup.annualRevenueHighUsd)}
            />
            <Metric
              description="Sites pay this to tracking-tool vendors."
              icon={Building2}
              label="Site-paid tool fees/yr"
              value={formatUsdRange(rollup.annualOperatorCostLowUsd, rollup.annualOperatorCostHighUsd)}
            />
            <Metric
              description="Observed presence estimate for visits in this period."
              icon={CircleDollarSign}
              label="This period"
              tone="signal"
              value={formatUsd(rollup.thisPeriodVisitUsd)}
            />
            <Metric icon={Globe2} label="Sites" value={rollup.siteCount} />
            <Metric icon={CalendarDays} label="Visits" value={rollup.visitCount} />
            <Metric icon={Radar} label="Trackers" tone="signal" value={rollup.trackerCount} />
            <Metric icon={Activity} label="Observations" value={rollup.observations} />
          </div>
        )}
        {!compact && rollup.edges.length > 0 ? (
          <div className="mt-5">
            <h3 className={TYPE.label}>Connections</h3>
            <p className={`${TYPE.small} mt-1`}>
              Which trackers were waiting for you on which sites — built from this browser's local ledger. Switch to "Who makes what" to see
              who profits, sized by estimated annual value.
            </p>
            <div className={`mt-2 ${UI.subtlePanel} p-4`}>
              <TrackerGraph edges={rollup.edges} />
            </div>
          </div>
        ) : null}
        {!compact ? (
          <details className="mt-5">
            <summary className={`${TYPE.label} cursor-pointer select-none`}>Show the math — how this money moves</summary>
            <SupplyChainMap rollup={rollup} />
            <div className="mt-5">
              <h3 className={TYPE.label}>Who they serve</h3>
              <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {(Object.keys(rollup.servesCounts) as Array<keyof typeof rollup.servesCounts>).map((category) => (
                  <div className={`${UI.subtlePanel} p-3`} key={category}>
                    <div className={TYPE.label}>{SERVES_LABELS[category]}</div>
                    <div className="mt-1 font-display text-xl font-semibold tabular-nums">{rollup.servesCounts[category]}</div>
                    {category === "only_their_business" && rollup.servesCounts[category] > 0 ? (
                      <p className={`${TYPE.small} mt-1`}>
                        {formatUsdRange(rollup.onlyTheirBusinessAnnualLowUsd, rollup.onlyTheirBusinessAnnualHighUsd)}/yr with nothing
                        flowing back to you
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </details>
        ) : null}
        {!compact ? <LedgerTables rollup={rollup} /> : null}
      </section>
      {showMethodology ? <Methodology /> : null}
    </>
  )
}
