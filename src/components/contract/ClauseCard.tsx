import { TYPE, UI } from "~components/system/tokens"
import type { ReconciledClass } from "~core/atlas/reconcile"
import type { Giveup } from "~core/atlas/types"

const DOC_LABELS: Record<string, string> = {
  privacy_policy: "Privacy policy",
  terms_of_use: "Terms of use",
  cookie_policy: "Cookie policy",
  community_guidelines: "Community guidelines",
  subscription_terms: "Subscription terms"
}

export function docLabel(docType: string): string {
  return DOC_LABELS[docType] ?? docType
}

function ClauseQuote({ giveup }: { giveup: Giveup }) {
  return (
    <blockquote className="mt-2 border-l-2 border-border pl-3 font-mono text-xs leading-5 text-muted-foreground">
      {giveup.source_quote}
    </blockquote>
  )
}

export function ClauseCard({ giveup }: { giveup: Giveup }) {
  return (
    <div className={`${UI.subtlePanel} p-3`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">{giveup.short_label}</p>
        <a className={`${TYPE.mono} text-muted-foreground underline decoration-dotted hover:text-foreground`} href="#severity-method">
          severity {giveup.scoring.score} / 100 · {docLabel(giveup.source_document)}
        </a>
      </div>
      <p className={`${TYPE.small} mt-1`}>{giveup.plain_english_summary}</p>
      <ClauseQuote giveup={giveup} />
      <div className={`${TYPE.small} mt-2 flex flex-wrap items-center justify-between gap-2`}>
        <span className="text-muted-foreground">{giveup.why_it_matters}</span>
        {giveup.source_url ? (
          <a className="underline hover:text-foreground" href={giveup.source_url} rel="noreferrer" target="_blank">
            Read the clause in place →
          </a>
        ) : null}
      </div>
    </div>
  )
}

export function ObservedClassCard({ entry, onShowEvidence }: { entry: ReconciledClass; onShowEvidence: () => void }) {
  return (
    <div className={`${UI.subtlePanel} ${entry.status === "undeclared" ? "border-amber-700/60" : ""} p-3`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">{entry.label}</p>
        <span className={`${TYPE.mono} text-muted-foreground`}>
          {entry.parties > 0 ? `${entry.parties} ${entry.parties === 1 ? "party" : "parties"} · ` : ""}
          {entry.tier === "observed" ? "observed on this page" : "readable by every script here"}
        </span>
      </div>
      {entry.status === "declared" ? (
        <div className="mt-2 flex flex-col gap-2">
          <p className={TYPE.small}>Their own documents claim this right. The clause:</p>
          {entry.clauses.slice(0, 2).map((clause) => (
            <ClauseCard giveup={clause} key={clause.id} />
          ))}
        </div>
      ) : (
        <p className={`${TYPE.small} mt-2`}>
          No authorizing clause was found in the documents we read. That is a statement about our read, not proof the contract is silent —
          but they did it, and we could not find where they told you.
        </p>
      )}
      <p className={`${TYPE.small} mt-2`}>
        <button className="underline hover:text-foreground" onClick={onShowEvidence} type="button">
          See the observed evidence →
        </button>
      </p>
    </div>
  )
}
