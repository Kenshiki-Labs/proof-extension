import Chip from "~components/system/Chip"
import { buildVerdict } from "~core/domain/attention"
import { formatUsdRange } from "~core/domain/valuation"
import type { SiteSummary } from "~core/domain/types"
import { TYPE, UI } from "~components/system/tokens"

// Act I: the verdict. One sentence, three tier chips, one action cue.
// Everything below any surface that renders this is supporting detail.
// Per docs/surface-contract.md this is the identical top element on both
// the popup and the report, and it always speaks — an empty page gets an
// explicit "nothing observed" verdict, never a silent gap (a missing
// verdict is indistinguishable from a broken pipeline).
const TIER_TONE = { red: "danger", amber: "amber", gray: "muted" } as const

const TIER_COPY = { red: "no trade", amber: "ads trade", gray: "site tools" } as const

export default function VerdictBanner({ compact = false, summary }: { compact?: boolean; summary: SiteSummary }) {
  const verdict = buildVerdict(summary)
  const observerTotal = verdict.companiesWatching
  const siteToolTotal = verdict.tierCounts.gray
  const sectionClass = compact ? `mt-3.5 ${UI.panel} ${UI.inset}` : `mt-6 ${UI.panel} ${UI.reportInset}`
  const sentenceClass = compact ? "font-display text-sm font-semibold leading-snug" : "font-display text-lg font-semibold leading-snug"

  if (observerTotal === 0 && siteToolTotal === 0) {
    return (
      <section className={sectionClass}>
        <p className={sentenceClass}>No watchers observed on this page yet.</p>
        <p className={`${TYPE.small} mt-1.5`}>Evidence is recorded as the page runs — reload the tab if it was open before Pulse was installed.</p>
      </section>
    )
  }

  return (
    <section className={sectionClass}>
      <p className={sentenceClass}>
        {observerTotal} {observerTotal === 1 ? "watcher" : "watchers"} on this page.
        {verdict.noTradeCount > 0
          ? ` ${verdict.noTradeCount} gave you nothing back — worth ${formatUsdRange(verdict.noTradeAnnualLowUsd, verdict.noTradeAnnualHighUsd)}/yr to them.`
          : " None were pure data merchants."}
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {(Object.keys(verdict.tierCounts) as Array<keyof typeof verdict.tierCounts>).map((tier) =>
          verdict.tierCounts[tier] > 0 ? (
            <Chip key={tier} tone={TIER_TONE[tier]}>
              {verdict.tierCounts[tier]} {TIER_COPY[tier]}
            </Chip>
          ) : null
        )}
        {verdict.quickActionCount > 0 ? (
          <span className={TYPE.small}>
            {verdict.quickActionCount} {verdict.quickActionCount === 1 ? "has" : "have"} a quick opt-out — start with the worst below.
          </span>
        ) : null}
      </div>
    </section>
  )
}
