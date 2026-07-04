import { Activity, Building2, CalendarDays, CircleDollarSign, Globe2, MousePointerClick, Radar, type LucideIcon } from "lucide-react"

import { formatUsd, formatUsdRange, SERVES_LABELS } from "~core/domain/valuation"
import TrackerGraph from "~components/value/TrackerGraph"
import type { MonetizationFlow, RollingValuationSummary, ValuationFlowRollup, ValuationPeriod } from "~core/domain/types"
import { TYPE, UI } from "~components/system/tokens"

export const VALUE_PERIODS: Array<{ label: string; value: ValuationPeriod }> = [
  { label: "Today", value: "day" },
  { label: "7 days", value: "week" },
  { label: "30 days", value: "month" },
  { label: "All", value: "all" }
]

const VALUE_LEDGER_EXPLAINER =
  "This is a supply-chain estimate, not a payout. Advertiser money enters through ad rails; site-paid fees enter through publisher tools; identity and measurement data can feed future auctions. You are observed, not paid."

const FLOW_ROLE_COPY: Record<MonetizationFlow, { label: string; money: string; note: string; position: string }> = {
  identity_infra: {
    label: "Identity infrastructure",
    money: "Data licensing, matching, attribution, and measurement value",
    note: "This is the layer where basic collection can enrich identity graphs and improve future targeting even when no ad is sold on the page.",
    position: "Data layer"
  },
  operator_saas: {
    label: "Publisher-side tools",
    money: "Sites pay vendors for analytics, replay, CDP, experimentation, support, or monitoring",
    note: "This is a site cost rail. It can still feed optimization and downstream tools, but it is not ad revenue.",
    position: "Site tooling"
  },
  platform_ads: {
    label: "Walled gardens / ad platforms",
    money: "Advertisers pay integrated ad networks that can combine demand, supply, exchange, and data roles",
    note: "Google, Amazon, Meta-style systems can be buyer interface, seller interface, auction, and data provider at once.",
    position: "Integrated ad rail"
  },
  programmatic: {
    label: "Open-web programmatic",
    money: "Advertiser spend moves through DSPs, exchanges, SSPs, and publisher ad slots",
    note: "This is the ad-tech tax rail. The publisher may receive residual revenue, but this extension does not estimate the site's share.",
    position: "Intermediary ad rail"
  }
}

function Metric({
  description,
  icon: IconComponent,
  label,
  tone = "muted",
  value
}: {
  description?: string
  icon: LucideIcon
  label: string
  tone?: "muted" | "signal" | "amber" | "danger"
  value: number | string
}) {
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
      {description ? <p className={`${TYPE.small} mt-2`}>{description}</p> : null}
    </div>
  )
}

function FlowRow({ amount, from, label, note, to, via }: { amount: string; from: string; label: string; note: string; to: string; via: string }) {
  return (
    <div className={`${UI.subtlePanel} p-3`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className={TYPE.label}>{label}</h4>
        <div className="font-display text-lg font-semibold tabular-nums">{amount}</div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">
        <div>
          <div className={TYPE.small}>Money starts with</div>
          <div className={TYPE.body}>{from}</div>
        </div>
        <div className="hidden text-muted-foreground sm:block">-&gt;</div>
        <div>
          <div className={TYPE.small}>Moves through</div>
          <div className={TYPE.body}>{via}</div>
        </div>
        <div className="hidden text-muted-foreground sm:block">-&gt;</div>
        <div>
          <div className={TYPE.small}>Modeled recipient</div>
          <div className={TYPE.body}>{to}</div>
        </div>
      </div>
      <p className={`${TYPE.small} mt-3`}>{note}</p>
    </div>
  )
}

function FlowRoleCard({ rollup }: { rollup: ValuationFlowRollup }) {
  const copy = FLOW_ROLE_COPY[rollup.flow]
  return (
    <div className={`${UI.subtlePanel} p-3`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className={TYPE.label}>{copy.label}</h4>
          <p className={`${TYPE.small} mt-1`}>{copy.position}</p>
        </div>
        <div className="text-right">
          <div className="font-display text-base font-semibold tabular-nums">{formatUsdRange(rollup.annualLowUsd, rollup.annualHighUsd)}</div>
          <div className={TYPE.small}>{rollup.trackerCount} {rollup.trackerCount === 1 ? "tracker" : "trackers"}</div>
        </div>
      </div>
      <p className={`${TYPE.body} mt-3`}>{copy.money}</p>
      <p className={`${TYPE.small} mt-2`}>{copy.note}</p>
    </div>
  )
}

function SupplyChainMap({ rollup }: { rollup: RollingValuationSummary }) {
  return (
    <section className={`mt-5 ${UI.subtlePanel} p-4`}>
      <h3 className={TYPE.label}>Value supply chain</h3>
      <p className={`${TYPE.body} mt-2 max-w-4xl`}>
        Not a pie. The same observation can help sell one ad, measure a conversion, enrich an identity graph, optimize a page, or feed the next auction. This ledger prices only defensible rails and labels the rest as not estimated.
      </p>
      <div className="mt-4 grid gap-3">
        <FlowRow
          amount={formatUsdRange(rollup.annualRevenueLowUsd, rollup.annualRevenueHighUsd)}
          from="Advertisers and ad budgets"
          label="Advertiser-funded ad rail/yr"
          note="Publishers may receive ad revenue on this rail, but this extension does not estimate publisher share, margin, or net outcome."
          to="ad platforms, DSPs, SSPs, identity/data intermediaries"
          via="walled gardens, DSPs, exchanges, SSPs, measurement, targeting, and identity infrastructure"
        />
        <FlowRow
          amount={formatUsdRange(rollup.annualOperatorCostLowUsd, rollup.annualOperatorCostHighUsd)}
          from="Sites you visited"
          label="Site-paid tool fees/yr"
          note="These tools may also create data exhaust for optimization, attribution, and future targeting. That downstream feedback is flagged, not separately priced."
          to="tracking-tool vendors"
          via="analytics, session replay, CRM, experimentation, support, monitoring, and tag management"
        />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {rollup.flowRollups.map((flowRollup) => <FlowRoleCard key={flowRollup.flow} rollup={flowRollup} />)}
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <dt className={TYPE.label}>Money to you</dt>
          <dd className="mt-1 font-display text-lg font-semibold tabular-nums">$0</dd>
          <p className={TYPE.small}>The browser user is the observed party, not a payee in this model.</p>
        </div>
        <div>
          <dt className={TYPE.label}>Money to the site</dt>
          <dd className="mt-1 font-display text-lg font-semibold tabular-nums">Not estimated</dd>
          <p className={TYPE.small}>A site may earn ad revenue or pay vendor fees. We do not allocate its net outcome.</p>
        </div>
        <div>
          <dt className={TYPE.label}>Ecosystem feedback</dt>
          <dd className="mt-1 font-display text-lg font-semibold tabular-nums">Flagged, not separately priced</dd>
          <p className={TYPE.small}>Basic collection can feed identity graphs, attribution, optimization, and future targeting.</p>
        </div>
      </dl>
    </section>
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
        <p className={TYPE.body}>{VALUE_LEDGER_EXPLAINER}</p>
        <p className={TYPE.body}>This ledger is local to this browser. It counts tracker presence observed by the extension, not actual revenue earned by any company.</p>
        <p className={TYPE.body}>A visit is a top-level page visit. A tracker presence is counted once per tracker per visit, even if that tracker makes many network requests.</p>
        <p className={TYPE.body}>Raw requests increase the observation count. They do not multiply per-visit value.</p>
        <p className={TYPE.body}>Ad-market value and site-paid tool fee estimates are separate rails. They are not added into a single payout or pie slice.</p>
        <p className={TYPE.body}>Basic collection can feed identity graphs, attribution, optimization, and future targeting even when this ledger cannot price that feedback separately.</p>
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
            <Metric description="Advertiser-funded value captured by tracker and ad-tech companies." icon={MousePointerClick} label="Ad-market value to trackers/yr" tone="amber" value={formatUsdRange(rollup.annualRevenueLowUsd, rollup.annualRevenueHighUsd)} />
            <Metric description="Sites pay this to tracking-tool vendors." icon={Building2} label="Site-paid tool fees/yr" value={formatUsdRange(rollup.annualOperatorCostLowUsd, rollup.annualOperatorCostHighUsd)} />
            <Metric description="Observed presence estimate for visits in this period." icon={CircleDollarSign} label="This period" tone="signal" value={formatUsd(rollup.thisPeriodVisitUsd)} />
            <Metric icon={Globe2} label="Sites" value={rollup.siteCount} />
            <Metric icon={CalendarDays} label="Visits" value={rollup.visitCount} />
            <Metric icon={Radar} label="Trackers" tone="signal" value={rollup.trackerCount} />
            <Metric icon={Activity} label="Observations" value={rollup.observations} />
          </div>
        )}
        {!compact ? <SupplyChainMap rollup={rollup} /> : null}
        {!compact ? (
          <div className="mt-5">
            <h3 className={TYPE.label}>Who they serve</h3>
            <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(Object.keys(rollup.servesCounts) as Array<keyof typeof rollup.servesCounts>).map((category) => (
                <div className={`${UI.subtlePanel} p-3`} key={category}>
                  <div className={TYPE.label}>{SERVES_LABELS[category]}</div>
                  <div className="mt-1 font-display text-xl font-semibold tabular-nums">{rollup.servesCounts[category]}</div>
                  {category === "only_their_business" && rollup.servesCounts[category] > 0 ? (
                    <p className={`${TYPE.small} mt-1`}>
                      {formatUsdRange(rollup.onlyTheirBusinessAnnualLowUsd, rollup.onlyTheirBusinessAnnualHighUsd)}/yr with nothing flowing back to you
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {!compact && rollup.edges.length > 0 ? (
          <div className="mt-5">
            <h3 className={TYPE.label}>Connections</h3>
            <p className={`${TYPE.small} mt-1`}>Which trackers were waiting for you on which sites — built from this browser's local ledger.</p>
            <div className={`mt-2 ${UI.subtlePanel} p-4`}>
              <TrackerGraph edges={rollup.edges} />
            </div>
          </div>
        ) : null}
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
                    <th className="p-2">Annual value/fees</th>
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