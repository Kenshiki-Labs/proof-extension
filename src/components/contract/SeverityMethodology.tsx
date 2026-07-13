import { TYPE, UI } from "~components/system/tokens"
import { CATEGORY_BOOSTS, RUBRIC_VERSION, WEIGHTS } from "~core/atlas/scoring"

// Human-readable meaning for each severity factor. The numbers themselves are
// imported from ~core/atlas/scoring — this section can never drift from the
// math actually used, because it renders the same constants the scorer reads.
const FACTOR_EXPLANATIONS: Array<{ key: keyof typeof WEIGHTS; label: string; meaning: string }> = [
  { key: "surprise", label: "Surprise", meaning: "How unexpected this is to a reasonable person" },
  { key: "data_sensitivity", label: "Data sensitivity", meaning: "How sensitive the data or rights implicated are" },
  { key: "scope_or_sharing", label: "Scope / sharing", meaning: "How broadly it applies or spreads downstream" },
  { key: "irreversibility", label: "Irreversibility", meaning: "Retention, permanence — whether it can be undone" },
  { key: "remedy_or_economic", label: "Remedy / economic", meaning: "Lost legal remedies or economic lock-in" },
  { key: "actionability_inverse", label: "Hard to avoid", meaning: "How difficult opting out actually is (inverse of actionability)" }
]

const BOOST_LABELS: Record<string, string> = {
  biometric_or_sensitive: "Biometric / sensitive data",
  arbitration_class_action_waiver: "Forced arbitration & class-action waiver",
  jury_trial_waiver: "Jury trial waiver",
  children_data: "Children's data",
  content_license: "Broad content license"
}

export default function SeverityMethodology() {
  return (
    <section className={`mt-6 ${UI.panel} ${UI.reportInset}`} id="severity-method">
      <h2 className={TYPE.label}>How severity is scored</h2>
      <p className={`${TYPE.body} mt-2 max-w-3xl`}>
        Every clause gets a deterministic 0–100 score — the same clause always scores the same, and no model or judgment call is involved.
        Six factors, each rated 0–1, are combined with fixed weights, scaled to 100:
      </p>
      <div className="mt-3 divide-y divide-border">
        {FACTOR_EXPLANATIONS.map((factor) => (
          <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 py-2 text-sm sm:grid-cols-[6rem_12rem_minmax(0,1fr)]" key={factor.key}>
            <span className="font-mono tabular-nums">× {WEIGHTS[factor.key].toFixed(2)}</span>
            <span className="font-semibold">{factor.label}</span>
            <span className="text-muted-foreground max-sm:col-span-2">{factor.meaning}</span>
          </div>
        ))}
      </div>
      <p className={`${TYPE.body} mt-4 max-w-3xl`}>
        Some clause types are alarming regardless of phrasing, so they add fixed points afterward (capped at 100):
      </p>
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
        {Object.entries(CATEGORY_BOOSTS).map(([category, boost]) => (
          <span className={`${TYPE.small} font-mono`} key={category}>
            +{boost} {BOOST_LABELS[category] ?? category}
          </span>
        ))}
      </div>
      <p className={`${TYPE.small} mt-3`}>
        Rubric {RUBRIC_VERSION} — identical to the Consumer Consent Atlas rubric, so a clause scores the same here and there. Higher = more
        alarming to a reasonable person; this is a consumer-alarm score, not a corporate legal-risk score.
      </p>
    </section>
  )
}
