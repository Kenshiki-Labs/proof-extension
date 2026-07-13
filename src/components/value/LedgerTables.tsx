import { TYPE, UI } from "~components/system/tokens"
import type { RollingValuationSummary } from "~core/domain/types"
import { formatUsd, formatUsdRange } from "~core/domain/valuation"

export default function LedgerTables({ rollup }: { rollup: RollingValuationSummary }) {
  return (
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
  )
}
