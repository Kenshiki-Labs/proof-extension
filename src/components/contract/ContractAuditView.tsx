import { useEffect, useState } from "react"
import browser from "webextension-polyfill"

import { TYPE, UI } from "~components/system/tokens"
import type { ConsentAuditRecord } from "~core/atlas/audit"
import { reconcile, type ConsentAudit } from "~core/atlas/reconcile"
import { RuntimeMessageSchema } from "~core/contracts/messages"
import type { SiteSummary } from "~core/domain/types"

import { ClauseCard, ObservedClassCard } from "~components/contract/ClauseCard"
import ProvenanceFooter from "~components/contract/ProvenanceFooter"
import SeverityMethodology from "~components/contract/SeverityMethodology"

// Done vs. Declared (docs/consent-atlas-tab-spec.md): reconciles what this
// page DID (the observed event stream) with what its own legal documents SAY
// it may do (clauses detected live from documents the page links to on its
// own domain). Three outputs: done-and-declared, done-with-no-clause-found
// (the disclosure gap), and declared-but-not-seen (dormant powers).
//
// A first-class report view — it shares the report's already-loaded summary
// (one source of observed truth, no second fetch) and triggers the audit on
// mount, i.e. when the user selects the Contract view. Still user-initiated:
// selecting the view IS the request to read the documents.

type AuditState =
  | { status: "loading" }
  | { status: "failed"; reason: "no_tab" | "restricted_page" | "anchor_harvest_failed" | "malformed" }
  | { status: "ready"; record: ConsentAuditRecord }

function ContractSectionTitle({ index, title }: { index: string; title: string }) {
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

type Props = {
  tabId: number | null
  summary: SiteSummary
  summaryReady: boolean
  summaryFailed: boolean
  onShowEvidence: () => void
}

export default function ContractAuditView({ tabId, summary, summaryReady, summaryFailed, onShowEvidence }: Props) {
  const [auditState, setAuditState] = useState<AuditState>({ status: "loading" })

  useEffect(() => {
    if (!tabId || tabId < 0) {
      setAuditState({ status: "failed", reason: "no_tab" })
      return
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

    runAudit().catch(() => setAuditState({ status: "failed", reason: "malformed" }))
  }, [tabId])

  const record = auditState.status === "ready" ? auditState.record : null
  // The verdict may only speak when BOTH sides of the reconciliation are
  // confirmed: the audit record AND the observed summary. Rendering against
  // an unloaded summary would claim "0 extraction behaviors observed" while
  // the popup shows watchers on the same tab — the exact overclaim this
  // surface exists to condemn.
  // Documents discovered but none READABLE (fetch failed or a JS-rendered
  // shell with no extractable text): the reconciliation must NOT run —
  // "silent on N" may only rest on documents actually read as text.
  const noneReadable = record ? record.documents.length > 0 && record.documents.every((doc) => doc.fetchError !== null || doc.thinContent) : false
  const audit = record && summaryReady && !noneReadable ? reconcile(summary.events, record.giveups) : null

  const declared = audit?.observed.filter((entry) => entry.status === "declared") ?? []
  const undeclared = audit?.observed.filter((entry) => entry.status === "undeclared") ?? []

  return (
    <>
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

      {record && !summaryReady && !summaryFailed ? (
        <section className={`mt-6 ${UI.panel} ${UI.reportInset}`}>
          <p className={TYPE.body}>
            Documents read. Waiting for this tab's observed evidence before reconciling — no claim is made until both
            sides are confirmed.
          </p>
        </section>
      ) : null}

      {record && summaryFailed ? (
        <section className={`mt-6 ${UI.panel} ${UI.reportInset}`} role="alert">
          <h2 className={TYPE.label}>Could not read the observed evidence for this tab</h2>
          <p className={`${TYPE.body} mt-2`}>
            The documents below were read, but the observed side of the reconciliation is unavailable — so no claim is
            made about what happened on this page.
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
            is itself worth knowing: the extraction observed in the evidence view is running without a discoverable
            written basis on this page.
          </p>
        </section>
      ) : null}

      {record && (noneReadable || summaryFailed) ? <ProvenanceFooter record={record} /> : null}

      {record && audit && !record.nothingDiscovered ? (
        <>
          <VerdictHeader audit={audit} domain={record.domain} />

          {undeclared.length > 0 ? (
            <section className={`mt-6 ${UI.panel} ${UI.reportInset}`}>
              <ContractSectionTitle index="01" title="Done here — and no clause found" />
              <p className={`${TYPE.small} mt-2`}>The disclosure gap: observed on this page, unmatched in its own documents.</p>
              <div className="mt-3 flex flex-col gap-3">
                {undeclared.map((entry) => (
                  <ObservedClassCard entry={entry} key={entry.key} onShowEvidence={onShowEvidence} />
                ))}
              </div>
            </section>
          ) : null}

          {declared.length > 0 ? (
            <section className={`mt-6 ${UI.panel} ${UI.reportInset}`}>
              <ContractSectionTitle index="02" title="Done here — with the receipt" />
              <p className={`${TYPE.small} mt-2`}>Observed on this page, and authorized by the site's own contract. The clauses:</p>
              <div className="mt-3 flex flex-col gap-3">
                {declared.map((entry) => (
                  <ObservedClassCard entry={entry} key={entry.key} onShowEvidence={onShowEvidence} />
                ))}
              </div>
            </section>
          ) : null}

          {audit.dormant.length > 0 ? (
            <section className={`mt-6 ${UI.panel} ${UI.reportInset}`}>
              <ContractSectionTitle index="03" title="Declared — powers you never saw exercised" />
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
              <ContractSectionTitle index="04" title="The banner vs. the contract" />
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
    </>
  )
}
