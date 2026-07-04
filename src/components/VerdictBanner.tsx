import { buildVerdict } from "~core/domain/attention"
import { formatUsdRange } from "~core/domain/valuation"
import type { SiteSummary } from "~core/domain/types"
import { TYPE, UI } from "~components/system/tokens"

// Act I: the verdict. One sentence, three tier chips, one action cue.
// Everything below any surface that renders this is supporting detail.
const TIER_CHIP = {
  red: "border-danger/60 bg-danger/10 text-danger",
  amber: "border-amber-700/60 bg-amber-700/10 text-amber-700",
  gray: "border-border bg-muted/40 text-muted-foreground"
} as const

const TIER_COPY = { red: "no trade", amber: "ads trade", gray: "site tools" } as const

export default function VerdictBanner({ compact = false, summary }: { compact?: boolean; summary: SiteSummary }) {
  const verdict = buildVerdict(summary)
  const total = verdict.tierCounts.red + verdict.tierCounts.amber + verdict.tierCounts.gray
  if (total === 0) return null

  return (
    <section className={compact ? `mt-3.5 ${UI.panel} ${UI.inset}` : `mt-6 ${UI.panel} ${UI.reportInset}`}>
      <p className={compact ? "font-display text-sm font-semibold leading-snug" : "font-display text-lg font-semibold leading-snug"}>
        {total} {total === 1 ? "observer" : "observers"} watched this page.
        {verdict.noTradeCount > 0
          ? ` ${verdict.noTradeCount} gave you nothing back — worth ${formatUsdRange(verdict.noTradeAnnualLowUsd, verdict.noTradeAnnualHighUsd)}/yr to them.`
          : " None were pure data merchants."}
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {(Object.keys(verdict.tierCounts) as Array<keyof typeof verdict.tierCounts>).map((tier) =>
          verdict.tierCounts[tier] > 0 ? (
            <span className={`rounded-full border px-2 py-0.5 text-[0.625rem] uppercase ${TIER_CHIP[tier]}`} key={tier}>
              {verdict.tierCounts[tier]} {TIER_COPY[tier]}
            </span>
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
