import "~style.css"

import { useEffect, useState } from "react"
import browser from "webextension-polyfill"

import SiteLogo from "~components/system/SiteLogo"
import { TYPE, UI } from "~components/system/tokens"
import type { ConsentAuditRecord } from "~core/atlas/audit"
import { reconcile, type ConsentAudit, type ReconciledClass } from "~core/atlas/reconcile"
import { CATEGORY_BOOSTS, RUBRIC_VERSION, WEIGHTS } from "~core/atlas/scoring"
import type { Giveup } from "~core/atlas/types"
import { RuntimeMessageSchema } from "~core/contracts/schemas"
import type { SiteSummary } from "~core/domain/types"
import { EMPTY_SUMMARY, parseSiteSummaryResponse } from "~core/report/display"

// Done vs. Declared (docs/consent-atlas-tab-spec.md): reconciles what this
// page DID (the observed event stream) with what its own legal documents SAY
// it may do (clauses detected live from the site's own privacy/terms/cookie
// pages). Three outputs: done-and-declared, done-with-no-clause-found (the
// disclosure gap), and declared-but-not-seen (dormant powers).

const DOC_LABELS: Record<string, string> = {
  privacy_policy: "Privacy policy",
  terms_of_use: "Terms of use",
  cookie_policy: "Cookie policy",
  community_guidelines: "Community guidelines",
  subscription_terms: "Subscription terms",
}

type AuditState =
  | { status: "loading" }
  | { status: "failed"; reason: "no_tab" | "restricted_page" | "anchor_harvest_failed" | "malformed" }
  | { status: "ready"; record: ConsentAuditRecord }

function docLabel(docType: string): string {
  return DOC_LABELS[docType] ?? docType
}

function ClauseQuote({ giveup }: { giveup: Giveup }) {
  return (
    <blockquote className="mt-2 border-l-2 border-border pl-3 font-mono text-xs leading-5 text-muted-foreground">
      {giveup.source_quote}
    </blockquote>
  )
}

function ClauseCard({ giveup }: { giveup: Giveup }) {
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

function ObservedClassCard({ entry, reportHref }: { entry: ReconciledClass; reportHref: string | null }) {
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
          No authorizing clause was found in the documents we read. That is a statement about our read, not proof the
          contract is silent — but they did it, and we could not find where they told you.
        </p>
      )}
      {reportHref ? (
        <p className={`${TYPE.small} mt-2`}>
          <a className="underline hover:text-foreground" href={reportHref}>
            See the observed evidence in the full report →
          </a>
        </p>
      ) : null}
    </div>
  )
}

function SectionTitle({ index, title }: { index: string; title: string }) {
  return (
    <h2 className={TYPE.label}>
      <span className="text-signal">{index}</span> · {title}
    </h2>
  )
}

function VerdictHeader({ audit, domain }: { audit: ConsentAudit; domain: string }) {
  const { declared, undeclared, dormant, observedClasses } = audit.counts
  return (
    <section className={`mt-6 ${UI.panel} ${UI.reportInset}`}>
      <p className={TYPE.label}>Done vs. declared</p>
      <p className="mt-2 max-w-3xl text-lg leading-snug">
        We observed <strong className="tabular-nums">{observedClasses}</strong> extraction{" "}
        {observedClasses === 1 ? "behavior" : "behaviors"} on <strong>{domain}</strong>. Its own documents claim the
        right to <strong className="tabular-nums">{declared}</strong> of them, are silent on{" "}
        <strong className="tabular-nums">{undeclared}</strong>, and reserve{" "}
        <strong className="tabular-nums">{dormant}</strong> further {dormant === 1 ? "power" : "powers"} you never saw
        exercised.
      </p>
    </section>
  )
}

// Human-readable meaning for each severity factor. The numbers themselves are
// imported from ~core/atlas/scoring — this section can never drift from the
// math actually used, because it renders the same constants the scorer reads.
const FACTOR_EXPLANATIONS: Array<{ key: keyof typeof WEIGHTS; label: string; meaning: string }> = [
  { key: "surprise", label: "Surprise", meaning: "How unexpected this is to a reasonable person" },
  { key: "data_sensitivity", label: "Data sensitivity", meaning: "How sensitive the data or rights implicated are" },
  { key: "scope_or_sharing", label: "Scope / sharing", meaning: "How broadly it applies or spreads downstream" },
  { key: "irreversibility", label: "Irreversibility", meaning: "Retention, permanence — whether it can be undone" },
  { key: "remedy_or_economic", label: "Remedy / economic", meaning: "Lost legal remedies or economic lock-in" },
  { key: "actionability_inverse", label: "Hard to avoid", meaning: "How difficult opting out actually is (inverse of actionability)" },
]

const BOOST_LABELS: Record<string, string> = {
  biometric_or_sensitive: "Biometric / sensitive data",
  arbitration_class_action_waiver: "Forced arbitration & class-action waiver",
  jury_trial_waiver: "Jury trial waiver",
  children_data: "Children's data",
  content_license: "Broad content license",
}

function SeverityMethodology() {
  return (
    <section className={`mt-6 ${UI.panel} ${UI.reportInset}`} id="severity-method">
      <h2 className={TYPE.label}>How severity is scored</h2>
      <p className={`${TYPE.body} mt-2 max-w-3xl`}>
        Every clause gets a deterministic 0–100 score — the same clause always scores the same, and no model or
        judgment call is involved. Six factors, each rated 0–1, are combined with fixed weights, scaled to 100:
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
        Rubric {RUBRIC_VERSION} — identical to the Consumer Consent Atlas rubric, so a clause scores the same here and
        there. Higher = more alarming to a reasonable person; this is a consumer-alarm score, not a corporate
        legal-risk score.
      </p>
    </section>
  )
}

function ProvenanceFooter({ record }: { record: ConsentAuditRecord }) {
  return (
    <section className={`mt-6 ${UI.panel} ${UI.reportInset}`}>
      <h2 className={TYPE.label}>Documents read for this audit</h2>
      <div className="mt-3 divide-y divide-border">
        {record.documents.map((doc) => (
          <div className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm" key={doc.docType}>
            <span>
              <strong>{docLabel(doc.docType)}</strong>{" "}
              {doc.fetchError ? (
                <span className="text-danger">fetch failed ({doc.fetchError})</span>
              ) : (
                <a className="underline hover:text-foreground" href={doc.finalUrl} rel="noreferrer" target="_blank">
                  {doc.finalUrl}
                </a>
              )}
              {!doc.fetchError && doc.thinContent ? (
                <span className="text-danger"> — no readable text (script-rendered page); excluded from detection</span>
              ) : null}
            </span>
            <span className={`${TYPE.mono} text-muted-foreground`}>
              {doc.lastUpdated ? `last updated ${doc.lastUpdated} · ` : ""}
              {doc.textLength.toLocaleString()} chars · {doc.textHash || "no text"}
            </span>
          </div>
        ))}
      </div>
      <p className={`${TYPE.small} mt-3`}>
        Fetched now, at your request, from documents this page links to on its own domain — redirects may land on a
        policy-center host, and the final address shown is where the text actually came from. Clause detection is
        deterministic (rule set {record.giveups[0]?.ontology_version ?? "consent-dark-patterns-0.1.0"}); a clause we
        did not find is reported as not found — never as not existing.
      </p>
    </section>
  )
}

function ContractTab() {
  const [summary, setSummary] = useState<SiteSummary>(EMPTY_SUMMARY)
  const [summaryState, setSummaryState] = useState<"loading" | "loaded" | "failed">("loading")
  const [auditState, setAuditState] = useState<AuditState>({ status: "loading" })

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const tabIdParam = Number(params.get("tabId"))
    const tabId = Number.isFinite(tabIdParam) && tabIdParam > 0 ? tabIdParam : undefined

    if (!tabId) {
      setAuditState({ status: "failed", reason: "no_tab" })
      return
    }

    async function loadSummary() {
      const response = await browser.runtime.sendMessage({ type: "GET_SITE_SUMMARY", tabId })
      const parsed = parseSiteSummaryResponse(response)
      if (parsed.success) {
        setSummary(parsed.data)
        setSummaryState("loaded")
        return
      }
      setSummaryState("failed")
    }

    async function runAudit() {
      const response = await browser.runtime.sendMessage({ type: "RUN_CONSENT_AUDIT", tabId })
      const parsed = RuntimeMessageSchema.safeParse(response)
      if (!parsed.success) {
        setAuditState({ status: "failed", reason: "malformed" })
        return
      }
      if (parsed.data.type === "CONSENT_AUDIT") {
        setAuditState({ status: "ready", record: parsed.data.payload })
        return
      }
      if (parsed.data.type === "CONSENT_AUDIT_FAILED") {
        setAuditState({ status: "failed", reason: parsed.data.reason })
        return
      }
      setAuditState({ status: "failed", reason: "malformed" })
    }

    loadSummary().catch(() => setSummaryState("failed"))
    runAudit().catch(() => setAuditState({ status: "failed", reason: "malformed" }))
  }, [])

  const record = auditState.status === "ready" ? auditState.record : null
  // The verdict may only speak when BOTH sides of the reconciliation are
  // confirmed: the audit record AND the observed summary. Rendering against
  // an unloaded summary would claim "0 extraction behaviors observed" while
  // the popup shows watchers on the same tab — the exact overclaim this
  // surface exists to condemn.
  const summaryReady = summaryState === "loaded"
  // Documents discovered but none READABLE (fetch failed or a JS-rendered
  // shell with no extractable text): the reconciliation must NOT run —
  // "silent on N" may only rest on documents actually read as text.
  const noneReadable = record ? record.documents.length > 0 && record.documents.every((doc) => doc.fetchError !== null || doc.thinContent) : false
  const audit = record && summaryReady && !noneReadable ? reconcile(summary.events, record.giveups) : null
  const params = new URLSearchParams(location.search)
  const tabIdParam = params.get("tabId")
  const reportHref = tabIdParam ? `report.html?tabId=${tabIdParam}&view=evidence` : null

  const declared = audit?.observed.filter((entry) => entry.status === "declared") ?? []
  const undeclared = audit?.observed.filter((entry) => entry.status === "undeclared") ?? []

  return (
    <main className="mx-auto max-w-4xl bg-background p-6 font-body text-foreground">
      <header className="flex items-start justify-between gap-3">
        <SiteLogo sublabel="Done vs. Declared" textClass="text-base" />
        {record ? <span className={`${TYPE.mono} text-muted-foreground`}>{record.domain}</span> : null}
      </header>

      {auditState.status === "loading" ? (
        <section className={`mt-6 ${UI.panel} ${UI.reportInset}`}>
          <p className={TYPE.body}>
            Reading this site's own legal documents — the privacy policy, terms, and cookie policy its footer links
            to. One moment.
          </p>
        </section>
      ) : null}

      {auditState.status === "failed" ? (
        <section className={`mt-6 ${UI.panel} ${UI.reportInset}`} role="alert">
          <h2 className={TYPE.label}>Audit could not run</h2>
          <p className={`${TYPE.body} mt-2`}>
            {auditState.reason === "restricted_page"
              ? "This page is a browser or extension page — there is no site contract to read here."
              : auditState.reason === "anchor_harvest_failed"
                ? "Chrome refused script access to this tab, so its policy links could not be read. Reload the tab and try again."
                : auditState.reason === "no_tab"
                  ? "No source tab was supplied for this audit."
                  : "The background returned a malformed audit."}
          </p>
        </section>
      ) : null}

      {record && summaryState === "failed" ? (
        <section className={`mt-6 ${UI.panel} ${UI.reportInset}`} role="alert">
          <h2 className={TYPE.label}>Could not read the observed evidence for this tab</h2>
          <p className={`${TYPE.body} mt-2`}>
            The documents below were read, but the observed side of the reconciliation is unavailable — so no claim is
            made about what happened on this page. Reopen this audit from the popup.
          </p>
        </section>
      ) : null}

      {record && noneReadable ? (
        <section className={`mt-6 ${UI.panel} ${UI.reportInset}`} role="alert">
          <h2 className={TYPE.label}>Documents found, but none could be read</h2>
          <p className={`${TYPE.body} mt-2`}>
            This page links to {record.documents.length} legal {record.documents.length === 1 ? "document" : "documents"},
            but none yielded readable text — fetches failed or the pages render their text with scripts we do not run.
            No claim is made about what the contract says: the reconciliation only runs against documents actually
            read.
          </p>
        </section>
      ) : null}

      {record?.nothingDiscovered ? (
        <section className={`mt-6 ${UI.panel} ${UI.reportInset}`}>
          <h2 className={TYPE.label}>No public legal documents were discoverable from this page</h2>
          <p className={`${TYPE.body} mt-2`}>
            This page's links did not lead to a privacy policy, terms of use, or cookie policy we could classify. That
            is itself worth knowing: the extraction observed in the report is running without a discoverable written
            basis on this page.
          </p>
        </section>
      ) : null}

      {record && (noneReadable || summaryState === "failed") ? <ProvenanceFooter record={record} /> : null}

      {record && audit && !record.nothingDiscovered ? (
        <>
          <VerdictHeader audit={audit} domain={record.domain} />

          {undeclared.length > 0 ? (
            <section className={`mt-6 ${UI.panel} ${UI.reportInset}`}>
              <SectionTitle index="01" title="Done here — and no clause found" />
              <p className={`${TYPE.small} mt-2`}>The disclosure gap: observed on this page, unmatched in its own documents.</p>
              <div className="mt-3 flex flex-col gap-3">
                {undeclared.map((entry) => (
                  <ObservedClassCard entry={entry} key={entry.key} reportHref={reportHref} />
                ))}
              </div>
            </section>
          ) : null}

          {declared.length > 0 ? (
            <section className={`mt-6 ${UI.panel} ${UI.reportInset}`}>
              <SectionTitle index="02" title="Done here — with the receipt" />
              <p className={`${TYPE.small} mt-2`}>Observed on this page, and authorized by the site's own contract. The clauses:</p>
              <div className="mt-3 flex flex-col gap-3">
                {declared.map((entry) => (
                  <ObservedClassCard entry={entry} key={entry.key} reportHref={reportHref} />
                ))}
              </div>
            </section>
          ) : null}

          {audit.dormant.length > 0 ? (
            <section className={`mt-6 ${UI.panel} ${UI.reportInset}`}>
              <SectionTitle index="03" title="Declared — powers you never saw exercised" />
              <p className={`${TYPE.small} mt-2`}>
                Also in the contract, with no observed counterpart this session. Worst first.
              </p>
              <div className="mt-3 flex flex-col gap-3">
                {audit.dormant.map((giveup) => (
                  <ClauseCard giveup={giveup} key={giveup.id} />
                ))}
              </div>
            </section>
          ) : null}

          {audit.consentTheater.bannerObserved ? (
            <section className={`mt-6 ${UI.panel} ${UI.reportInset}`}>
              <SectionTitle index="04" title="The banner vs. the contract" />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className={`${UI.subtlePanel} p-3`}>
                  <p className={TYPE.label}>What the banner governed</p>
                  <p className={`${TYPE.small} mt-2`}>Cookie and stored-identifier choices.</p>
                </div>
                <div className={`${UI.subtlePanel} border-amber-700/60 p-3`}>
                  <p className={TYPE.label}>What the contract takes anyway</p>
                  <p className={`${TYPE.small} mt-2`}>
                    Everything above — plus {audit.consentTheater.cookieClauses.length > 0 ? "the consent mechanics below" : "the readable browser surface"}, which exist regardless of your banner answer.
                  </p>
                </div>
              </div>
              {audit.consentTheater.cookieClauses.length > 0 ? (
                <div className="mt-3 flex flex-col gap-3">
                  {audit.consentTheater.cookieClauses.map((giveup) => (
                    <ClauseCard giveup={giveup} key={giveup.id} />
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          <SeverityMethodology />
          <ProvenanceFooter record={record} />
        </>
      ) : null}
    </main>
  )
}

export default ContractTab
