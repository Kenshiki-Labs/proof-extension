import { useState } from "react"

import { TYPE, UI } from "~components/system/tokens"
import { formatUsd, formatUsdRange } from "~core/domain/valuation"
import { calibratedAnnualUsd, FREQUENCY_LABELS, VISIT_FREQUENCIES, type VisitFrequency } from "~core/domain/visit-frequency"

// The one question that calibrates the value equation: "How often are you
// here?" The sourced annual estimates for the companies observed on this page
// describe an average person; the user's own answer places them within that
// range — a daily visitor is the heavy end of the audience those figures
// describe, a rare visitor the light end. The calibrated figure never leaves
// the sourced range. Asked once per registrable domain, changeable any time.

type Props = {
  compact?: boolean
  domain: string | null
  frequency: VisitFrequency | null
  onAnswer: (frequency: VisitFrequency) => void
  annualLowUsd: number
  annualHighUsd: number
  revenueTrackerCount: number
}

export default function VisitFrequencyAsk({
  compact = false,
  domain,
  frequency,
  onAnswer,
  annualLowUsd,
  annualHighUsd,
  revenueTrackerCount
}: Props) {
  const [editing, setEditing] = useState(false)

  // No sourced revenue range for this page's observed companies → no claim.
  if (!domain || !(annualHighUsd > 0) || revenueTrackerCount === 0) return null

  const sectionClass = compact ? `mt-3.5 ${UI.panel} ${UI.inset}` : `mt-6 ${UI.panel} ${UI.reportInset}`
  const calibrated = frequency ? calibratedAnnualUsd(annualLowUsd, annualHighUsd, frequency) : null

  if (frequency && !editing) {
    return (
      <section className={sectionClass}>
        {calibrated !== null ? (
          <p className={compact ? "text-sm leading-snug" : `${TYPE.body}`}>
            You said you're here {FREQUENCY_LABELS[frequency].toLowerCase()} — that puts you at the{" "}
            {frequency === "several_daily" || frequency === "daily" ? "heavy" : frequency === "few_weekly" ? "middle" : "light"} end of the
            audience these estimates describe: about <strong className="tabular-nums">{formatUsd(calibrated)}/yr</strong> to the{" "}
            {revenueTrackerCount} {revenueTrackerCount === 1 ? "company" : "companies"} monetizing this page.
          </p>
        ) : (
          <p className={compact ? "text-sm leading-snug" : `${TYPE.body}`}>
            A one-time visit — the yearly estimates here ({formatUsdRange(annualLowUsd, annualHighUsd)}) describe a repeat audience, so no
            yearly figure is claimed for you.
          </p>
        )}
        <p className={`${TYPE.small} mt-1 flex flex-wrap items-center gap-2`}>
          <span>
            Sourced average-person range: {formatUsdRange(annualLowUsd, annualHighUsd)}/yr. Your answer positions you inside it — an
            estimate, not a payout.
          </span>
          <button className="underline hover:text-foreground" onClick={() => setEditing(true)} type="button">
            Change
          </button>
        </p>
      </section>
    )
  }

  return (
    <section className={sectionClass}>
      <p className={TYPE.label}>How often are you here?</p>
      <p className={`${TYPE.small} mt-1`}>
        The {revenueTrackerCount} {revenueTrackerCount === 1 ? "company" : "companies"} monetizing this page{" "}
        {revenueTrackerCount === 1 ? "makes" : "make"} {formatUsdRange(annualLowUsd, annualHighUsd)}/yr from an average person. Your answer
        calibrates where you sit in that range on {domain}.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {VISIT_FREQUENCIES.map((option) => (
          <button
            className={`border px-2 py-1 font-mono text-xs transition-colors ${
              frequency === option
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
            }`}
            key={option}
            onClick={() => {
              setEditing(false)
              onAnswer(option)
            }}
            type="button">
            {FREQUENCY_LABELS[option]}
          </button>
        ))}
      </div>
    </section>
  )
}
