import { useState } from "react"

import { TYPE, UI } from "~components/system/tokens"
import { formatUsd } from "~core/domain/valuation"
import {
  calibratedAnnualUsd,
  FREQUENCY_LABELS,
  VISIT_FREQUENCIES,
  VISITS_PER_YEAR,
  type VisitFrequency,
} from "~core/domain/visit-frequency"

// The one question that calibrates the value equation: "How often are you
// here?" The tracker DB's annual numbers assume an average person; the user's
// own answer replaces that assumption with their actual relationship to the
// site — calibrated = observed per-visit value × their stated visits/year.
// Asked once per registrable domain, changeable any time, stored in settings.

type Props = {
  compact?: boolean
  domain: string | null
  frequency: VisitFrequency | null
  onAnswer: (frequency: VisitFrequency) => void
  thisVisitUsd: number
}

export default function VisitFrequencyAsk({ compact = false, domain, frequency, onAnswer, thisVisitUsd }: Props) {
  const [editing, setEditing] = useState(false)

  if (!domain || !(thisVisitUsd > 0)) return null

  const sectionClass = compact ? `mt-3.5 ${UI.panel} ${UI.inset}` : `mt-6 ${UI.panel} ${UI.reportInset}`
  const calibrated = frequency ? calibratedAnnualUsd(thisVisitUsd, frequency) : null

  if (frequency && calibrated !== null && !editing) {
    return (
      <section className={sectionClass}>
        <p className={compact ? "text-sm leading-snug" : `${TYPE.body}`}>
          At your rate — {FREQUENCY_LABELS[frequency].toLowerCase()}, ~{VISITS_PER_YEAR[frequency].toLocaleString()}{" "}
          visits/yr — the watchers here take about <strong className="tabular-nums">{formatUsd(calibrated)}/yr</strong>{" "}
          from your attention.
        </p>
        <p className={`${TYPE.small} mt-1 flex flex-wrap items-center gap-2`}>
          <span>Based on your answer × the observed per-visit value ({formatUsd(thisVisitUsd)}). An estimate.</span>
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
        Your answer calibrates the yearly value estimate for {domain} — worth {formatUsd(thisVisitUsd)} per visit to
        its watchers.
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
