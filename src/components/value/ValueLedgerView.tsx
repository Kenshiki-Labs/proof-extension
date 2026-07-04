import { Activity, Building2, CalendarDays, CircleDollarSign, Globe2, MousePointerClick, Radar, type LucideIcon } from "lucide-react"

import { formatUsd, formatUsdRange } from "~core/domain/valuation"
import type { RollingValuationSummary, ValuationPeriod } from "~core/domain/types"
import { TYPE, UI } from "~components/system/tokens"

export const VALUE_PERIODS: Array<{ label: string; value: ValuationPeriod }> = [
  { label: "Today", value: "day" },
  { label: "7 days", value: "week" },
  { label: "30 days", value: "month" },
  { label: "All", value: "all" }
]

function Metric({ icon: IconComponent, label, tone = "muted", value }: { icon: LucideIcon; label: string; tone?: "muted" | "signal" | "amber" | "danger"; value: number | string }) {
  const toneClass = {
    amber: "text-amber-700",
    danger: "text-danger",
    muted: "text-muted-foreground",
    signal: "text-signal"
  }[tone]

  return (
    <div className={`${UI.metricCard} min-w-0`}>
      <div className="flex items-center justify-between gap-3">
        <div className={TYPE.label}>{label}</div>
        <IconComponent aria-hidden className={`h-4 w-4 shrink-0 ${toneClass}`} />
      </div>
      <div className="mt-2 font-display text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
    </div>
  )
}

function PeriodSelector({ onPeriodChange, period, periods }: { onPeriodChange: (period: ValuationPeriod) => void; period: ValuationPeriod; periods: typeof VALUE_PERIODS }) {
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

function Methodology() {
  return (
    <section className={`mt-6 ${UI.panel} ${UI.reportInset}`}>
      <h2 className={TYPE.label}>How we calculate this</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <p className={TYPE.body}>This ledger is local to this browser. It counts tracker presence observed by the extension, not actual revenue earned by any company.</p>
        <p className={TYPE.body}>A visit is a top-level page visit. A tracker presence is counted once per tracker per visit, even if that tracker makes many network requests.</p>
        <p className={TYPE.body}>Raw requests increase the observation count. They do not multiply per-visit value.</p>
        <p className={TYPE.body}>Annual ad value and site tooling estimates are deduplicated by tracker inside the selected period.</p>
        <p className={TYPE.body}>Each historical entry stores the valuation estimate that was active when the tracker was observed.</p>
        <p className={TYPE.body}>Clearing the local value ledger removes this browser's rolling history. It does not affect tracker blocking or source-held records.</p>
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
        <p className={`${TYPE.small} mt-2`}>Local estimates from tracker presence observed by this extension. Not revenue measurements.</p>
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
            <dt className={TYPE.small}>Ad value/yr</dt>
            <dd className={TYPE.body}>{formatUsdRange(rollup.annualRevenueLowUsd, rollup.annualRevenueHighUsd)}</dd>
            <dt className={TYPE.small}>Site tooling/yr</dt>
            <dd className={TYPE.body}>{formatUsdRange(rollup.annualOperatorCostLowUsd, rollup.annualOperatorCostHighUsd)}</dd>
          </dl>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <Metric icon={Globe2} label="Sites" value={rollup.siteCount} />
            <Metric icon={CalendarDays} label="Visits" value={rollup.visitCount} />
            <Metric icon={Radar} label="Trackers" tone="signal" value={rollup.trackerCount} />
            <Metric icon={Activity} label="Observations" value={rollup.observations} />
            <Metric icon={CircleDollarSign} label="This period" tone="signal" value={formatUsd(rollup.thisPeriodVisitUsd)} />
            <Metric icon={MousePointerClick} label="Ad value/yr" tone="amber" value={formatUsdRange(rollup.annualRevenueLowUsd, rollup.annualRevenueHighUsd)} />
            <Metric icon={Building2} label="Site tooling/yr" value={formatUsdRange(rollup.annualOperatorCostLowUsd, rollup.annualOperatorCostHighUsd)} />
          </div>
        )}
        {!compact ? (
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <div className={UI.tableShell}>
              <h3 className={TYPE.label}>Top trackers</h3>
              <table className="mt-2 w-full min-w-[520px] text-left">
                <thead>
                  <tr className={`${TYPE.small} ${UI.tableHeader}`}>
                    <th className="p-2">Tracker</th>
                    <th className="p-2">Sites</th>
                    <th className="p-2">Visits</th>
                    <th className="p-2">Obs.</th>
                    <th className="p-2">This period</th>
                    <th className="p-2">Annual estimate</th>
                  </tr>
                </thead>
                <tbody>
                  {rollup.topTrackers.map((item) => (
                    <tr className={UI.tableRow} key={item.id}>
                      <td className={`${TYPE.body} p-2`}>{item.id}</td>
                      <td className={`${TYPE.body} p-2`}>{item.siteCount ?? 0}</td>
                      <td className={`${TYPE.body} p-2`}>{item.visitCount ?? 0}</td>
                      <td className={`${TYPE.body} p-2`}>{item.observations}</td>
                      <td className={`${TYPE.small} p-2`}>{formatUsd(item.thisPeriodVisitUsd)}</td>
                      <td className={`${TYPE.small} p-2`}>{formatUsdRange(item.annualLowUsd ?? 0, item.annualHighUsd ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={UI.tableShell}>
              <h3 className={TYPE.label}>Top sites</h3>
              <table className="mt-2 w-full min-w-[460px] text-left">
                <thead>
                  <tr className={`${TYPE.small} ${UI.tableHeader}`}>
                    <th className="p-2">Site</th>
                    <th className="p-2">Trackers</th>
                    <th className="p-2">Visits</th>
                    <th className="p-2">Obs.</th>
                    <th className="p-2">This period</th>
                  </tr>
                </thead>
                <tbody>
                  {rollup.topSites.map((item) => (
                    <tr className={UI.tableRow} key={item.id}>
                      <td className={`${TYPE.body} break-all p-2`}>{item.id}</td>
                      <td className={`${TYPE.body} p-2`}>{item.trackerCount ?? 0}</td>
                      <td className={`${TYPE.body} p-2`}>{item.visitCount ?? 0}</td>
                      <td className={`${TYPE.body} p-2`}>{item.observations}</td>
                      <td className={`${TYPE.small} p-2`}>{formatUsd(item.thisPeriodVisitUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>
      {showMethodology ? <Methodology /> : null}
    </>
  )
}