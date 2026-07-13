import { TYPE, UI } from "~components/system/tokens"
import { groupBySupplyChainStage } from "~core/domain/supply-chain"
import type { MonetizationFlow, RollingValuationSummary, ValuationFlowRollup } from "~core/domain/types"
import { formatUsdRange } from "~core/domain/valuation"

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

function formatCount(value: number) {
  return value.toLocaleString("en-US")
}

function findFlowRollup(rollup: RollingValuationSummary, flow: MonetizationFlow) {
  return (
    rollup.flowRollups.find((flowRollup) => flowRollup.flow === flow) ?? {
      annualHighUsd: 0,
      annualLowUsd: 0,
      flow,
      observations: 0,
      thisPeriodVisitUsd: 0,
      trackerCount: 0
    }
  )
}

function BillOfMaterials({ rollup }: { rollup: RollingValuationSummary }) {
  const platformAds = findFlowRollup(rollup, "platform_ads")
  const programmatic = findFlowRollup(rollup, "programmatic")
  const identityInfra = findFlowRollup(rollup, "identity_infra")
  const operatorSaas = findFlowRollup(rollup, "operator_saas")
  const advertiserRailLow = platformAds.annualLowUsd + programmatic.annualLowUsd
  const advertiserRailHigh = platformAds.annualHighUsd + programmatic.annualHighUsd
  const stages = [
    {
      label: "Extraction / mining",
      metric: `${formatCount(rollup.observations)} observations`,
      role: `${formatCount(rollup.trackerCount)} trackers across ${formatCount(rollup.siteCount)} sites`,
      note: "Raw page views, clicks, scripts, pixels, SDKs, and device/browser signals enter the system. The browser user is the source and receives no royalty."
    },
    {
      label: "Refining",
      metric: formatUsdRange(identityInfra.annualLowUsd, identityInfra.annualHighUsd),
      role: `${identityInfra.trackerCount} identity or measurement ${identityInfra.trackerCount === 1 ? "tracker" : "trackers"}`,
      note: "Raw events become cleaner identity, attribution, analytics, or measurement material. Some value is priced here; broader profile enrichment is flagged, not separately priced."
    },
    {
      label: "Audience parts",
      metric: "Not separately priced",
      role: "Segments, cohorts, scores, and retargeting lists",
      note: "Refined profiles can become reusable audience components. The ledger avoids inventing a hidden dollar amount for downstream segment reuse."
    },
    {
      label: "Auction assembly",
      metric: formatUsdRange(advertiserRailLow, advertiserRailHigh),
      role: `${platformAds.trackerCount + programmatic.trackerCount} ad-market ${platformAds.trackerCount + programmatic.trackerCount === 1 ? "tracker" : "trackers"}`,
      note: "A page load can become a just-in-time auction: profile signal, advertiser demand, publisher context, creative, and price assembled into one impression."
    },
    {
      label: "Wholesale / exchange",
      metric: formatUsdRange(programmatic.annualLowUsd, programmatic.annualHighUsd),
      role: `${programmatic.trackerCount} open-web programmatic ${programmatic.trackerCount === 1 ? "intermediary" : "intermediaries"}`,
      note: "DSPs, exchanges, SSPs, identity, and measurement layers can all touch the same impression. This ledger does not allocate take rates."
    },
    {
      label: "Retail surface",
      metric: formatUsdRange(operatorSaas.annualLowUsd, operatorSaas.annualHighUsd),
      role: `${operatorSaas.trackerCount} publisher-side ${operatorSaas.trackerCount === 1 ? "tool" : "tools"}`,
      note: "The site is the shelf and may earn ad revenue, but it also pays for analytics, tag management, experimentation, replay, support, and monitoring tools."
    }
  ]

  return (
    <section className="mt-4">
      <h4 className={TYPE.label}>Bill of materials</h4>
      <p className={`${TYPE.body} mt-2 max-w-4xl`}>
        The ledger is an invoice for the raw material and the factory stages around it, not a clean split of one payment.
      </p>
      <ol className="mt-3 grid gap-3 lg:grid-cols-2">
        {stages.map((stage) => (
          <li className={`${UI.subtlePanel} p-3`} key={stage.label}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h5 className={TYPE.label}>{stage.label}</h5>
              <div className="font-display text-base font-semibold tabular-nums">{stage.metric}</div>
            </div>
            <p className={`${TYPE.body} mt-2`}>{stage.role}</p>
            <p className={`${TYPE.small} mt-2`}>{stage.note}</p>
          </li>
        ))}
      </ol>
      <div className={`${UI.subtlePanel} mt-3 p-3`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h5 className={TYPE.label}>Missing input contract</h5>
          <div className="font-display text-base font-semibold tabular-nums">$0 to you</div>
        </div>
        <p className={`${TYPE.body} mt-2`}>
          The unusual part is not that the factory exists. It is that the raw-material source sits outside the ledger: observed, priced,
          optimized against, and unpaid.
        </p>
      </div>
    </section>
  )
}

function FlowRow({
  amount,
  from,
  label,
  note,
  to,
  via
}: {
  amount: string
  from: string
  label: string
  note: string
  to: string
  via: string
}) {
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
          <div className="font-display text-base font-semibold tabular-nums">
            {formatUsdRange(rollup.annualLowUsd, rollup.annualHighUsd)}
          </div>
          <div className={TYPE.small}>
            {rollup.trackerCount} {rollup.trackerCount === 1 ? "tracker" : "trackers"}
          </div>
        </div>
      </div>
      <p className={`${TYPE.body} mt-3`}>{copy.money}</p>
      <p className={`${TYPE.small} mt-2`}>{copy.note}</p>
    </div>
  )
}

export default function SupplyChainMap({ rollup }: { rollup: RollingValuationSummary }) {
  return (
    <section className={`mt-5 ${UI.subtlePanel} p-4`}>
      <h3 className={TYPE.label}>Value supply chain</h3>
      <p className={`${TYPE.body} mt-2 max-w-4xl`}>
        Not a pie. The same observation can help sell one ad, measure a conversion, enrich an identity graph, optimize a page, or feed the
        next auction. This ledger prices only defensible rails and labels the rest as not estimated.
      </p>
      <BillOfMaterials rollup={rollup} />
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
        {rollup.flowRollups.map((flowRollup) => (
          <FlowRoleCard key={flowRollup.flow} rollup={flowRollup} />
        ))}
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
      {(() => {
        const stages = groupBySupplyChainStage(rollup.edges.map((edge) => edge.trackerId))
        if (stages.length === 0) return null
        return (
          <div className="mt-4">
            <h4 className={TYPE.label}>The chain that ran on your browsing</h4>
            <ol className="mt-2 grid gap-2">
              {stages.map((stage, index) => (
                <li className={`${UI.subtlePanel} p-3`} key={stage.role}>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className={`${TYPE.label} text-signal`}>{String(index + 1).padStart(2, "0")}</span>
                    <span className={TYPE.label}>{stage.label}</span>
                    <span className={`${TYPE.small}`}>{stage.trackerIds.join(", ")}</span>
                  </div>
                  <p className={`${TYPE.small} mt-1`}>{stage.description}</p>
                </li>
              ))}
            </ol>
          </div>
        )
      })()}
    </section>
  )
}
