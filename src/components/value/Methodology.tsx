import { TYPE, UI } from "~components/system/tokens"

export const VALUE_LEDGER_EXPLAINER =
  "This is a supply-chain estimate, not a payout. Advertiser money enters through ad rails; site-paid fees enter through publisher tools; identity and measurement data can feed future auctions. You are observed, not paid."

export default function Methodology() {
  return (
    <section className={`mt-6 ${UI.panel} ${UI.reportInset}`}>
      <h2 className={TYPE.label}>How we calculate this</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <p className={TYPE.body}>{VALUE_LEDGER_EXPLAINER}</p>
        <p className={TYPE.body}>
          This ledger is local to this browser. It counts tracker presence observed by the extension, not actual revenue earned by any
          company.
        </p>
        <p className={TYPE.body}>
          A visit is a top-level page visit. A tracker presence is counted once per tracker per visit, even if that tracker makes many
          network requests.
        </p>
        <p className={TYPE.body}>Raw requests increase the observation count. They do not multiply per-visit value.</p>
        <p className={TYPE.body}>
          Ad-market value and site-paid tool fee estimates are separate rails. They are not added into a single payout or pie slice.
        </p>
        <p className={TYPE.body}>
          Basic collection can feed identity graphs, attribution, optimization, and future targeting even when this ledger cannot price that
          feedback separately.
        </p>
        <p className={TYPE.body}>Each historical entry stores the valuation estimate that was active when the tracker was observed.</p>
        <p className={TYPE.body}>
          Clearing the local value ledger removes this browser's rolling history. It does not affect tracker blocking or source-held
          records.
        </p>
      </div>
    </section>
  )
}
