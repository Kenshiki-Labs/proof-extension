import { getObserverRemediation } from "~core/domain/remediation"
import type { DisplayObservation } from "~core/report/display"
import { displayEventKey, titleCase } from "~core/report/display"
import { TYPE, UI } from "~components/system/tokens"

import { BulletList } from "~components/report/shared"

export default function RemediationPanel({ observations }: { observations: DisplayObservation[] }) {
  const remediationItems = observations
    .map(({ event, count }) => ({ event, count, remediation: getObserverRemediation(event) }))
    .filter((item) => item.remediation)

  return (
    // Rendered inside act 2's disclosure, not as its own numbered act — the
    // panel chrome and number would read as a section escaping its parent.
    <section className="mt-3">
      <h3 className={TYPE.label}>Stop at source</h3>
      {remediationItems.length === 0 ? <p className={`${TYPE.body} mt-3`}>No source-level remediation path is known for the current observations.</p> : (
        <div className="mt-4 space-y-3">
          {remediationItems.map(({ event, remediation }) => remediation ? (
            <article className={`${UI.subtlePanel} p-4`} key={displayEventKey(event)}>
              <h3 className="font-display text-base font-semibold tracking-tight">{remediation.observerName}</h3>
              <p className={`${TYPE.small} mt-1`}>{remediation.parentCompany} · {remediation.categoryLabels.join(" · ")}</p>
              <p className={`${TYPE.body} mt-3`}>{remediation.explanation.plainSummary}</p>
              <dl className="mt-4 grid gap-x-5 gap-y-2 sm:grid-cols-[180px_1fr]">
                <dt className={TYPE.small}>Collects</dt>
                <dd className={TYPE.body}>{remediation.collects.join(", ")}</dd>
                <dt className={TYPE.small}>Used for</dt>
                <dd className={TYPE.body}>{remediation.monetization.join(", ")}</dd>
                <dt className={TYPE.small}>Risk</dt>
                <dd className={TYPE.body}>{titleCase(remediation.explanation.riskLevel)} · {remediation.explanation.riskReasons.join(", ")}</dd>
                <dt className={TYPE.small}>Friction</dt>
                <dd className={TYPE.body}>{titleCase(remediation.frictionClass)} · about {remediation.estimatedTimeMinutes} min</dd>
                <dt className={TYPE.small}>Recheck</dt>
                <dd className={TYPE.body}>{remediation.recheckIntervalDays} days</dd>
              </dl>
              <div className="mt-4 grid gap-4 border-t border-border pt-4 md:grid-cols-2">
                <div>
                  <h4 className={TYPE.label}>Browser-visible data</h4>
                  <BulletList items={remediation.explanation.observedData} />
                </div>
                <div>
                  <h4 className={TYPE.label}>Site-provided data</h4>
                  <BulletList items={remediation.explanation.siteProvidedData} />
                </div>
                <div>
                  <h4 className={TYPE.label}>Not visible here</h4>
                  <BulletList items={remediation.explanation.notVisibleToExtension} />
                </div>
                <div>
                  <h4 className={TYPE.label}>Why it matters</h4>
                  <BulletList items={remediation.explanation.whyItMatters} />
                </div>
                <div>
                  <h4 className={TYPE.label}>Blocking changes</h4>
                  <BulletList items={remediation.explanation.whatBlockingChanges} />
                </div>
                <div>
                  <h4 className={TYPE.label}>Blocking does not change</h4>
                  <BulletList items={remediation.explanation.whatBlockingDoesNotChange} />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-3 border-t border-border pt-3">
                <a className={`${TYPE.label} underline`} href={remediation.futureCollectionUrl} rel="noreferrer" target="_blank">Opt out</a>
                <a className={`${TYPE.label} underline`} href={remediation.deletionUrl} rel="noreferrer" target="_blank">Request deletion</a>
              </div>
              <p className={`${TYPE.small} mt-2`}>Blocking does not delete prior records. {remediation.notes}</p>
            </article>
          ) : null)}
        </div>
      )}
    </section>
  )
}
