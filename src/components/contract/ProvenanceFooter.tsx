import { docLabel } from "~components/contract/ClauseCard"
import { TYPE, UI } from "~components/system/tokens"
import type { ConsentAuditRecord } from "~core/atlas/audit"

export default function ProvenanceFooter({ record }: { record: ConsentAuditRecord }) {
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
        Fetched now, at your request, from documents this page links to on its own domain — redirects may land on a policy-center host, and
        the final address shown is where the text actually came from. Clause detection is deterministic (rule set{" "}
        {record.giveups[0]?.ontology_version ?? "consent-dark-patterns-0.1.0"}); a clause we did not find is reported as not found — never
        as not existing.
      </p>
    </section>
  )
}
