import { countIdentifiedObservers, countSiteToolObservers, countUnclassifiedParties, countWatchingObservers } from "~core/domain/observer-counts"
import type { ObserverEvent, SiteSummary } from "~core/domain/types"
import type { DisplayObservation } from "~core/report/display"
import { TYPE, UI } from "~components/system/tokens"

import { Metric, SectionTitle } from "~components/report/shared"

export default function AuditBrief({
  allObservations,
  exposureEvents,
  localStateObservations,
  summary
}: {
  allObservations: DisplayObservation[]
  exposureEvents: ObserverEvent[]
  localStateObservations: DisplayObservation[]
  summary: SiteSummary
}) {
  const watchingObservers = countWatchingObservers(summary.events)
  const identifiedObservers = countIdentifiedObservers(summary.events)
  const unclassifiedParties = countUnclassifiedParties(summary.events)
  const siteToolObservers = countSiteToolObservers(summary.events)
  const exposedSignals = [...new Set(summary.exposedSignals.filter((signal) => signal !== "extension_diagnostic"))]
  const takeaways: string[] = []

  if (watchingObservers > 0) {
    takeaways.push(`${watchingObservers} distinct third-party ${watchingObservers === 1 ? "party was" : "parties were"} observed while this tab ran.`)
  } else {
    takeaways.push("No third-party observer was recorded for this tab yet; drive the critical journey and reload if the tab was open before Pulse attached.")
  }

  if (unclassifiedParties > 0) takeaways.push(`${unclassifiedParties} ${unclassifiedParties === 1 ? "party is" : "parties are"} not yet matched to the tracker database; classify before treating the journey as governed.`)
  if (siteToolObservers > 0) takeaways.push(`${siteToolObservers} site-tool ${siteToolObservers === 1 ? "observer is" : "observers are"} present; confirm it remains bounded on authenticated or sensitive pages.`)
  if (localStateObservations.length > 0) takeaways.push("Local state was recorded; open Local state to inspect cookie and storage metadata without copying values.")
  if (exposureEvents.length > 0) takeaways.push("A browser check is available; it shows what scripts could read, not proof this page read every field.")
  if (summary.pageErrors.length > 0) takeaways.push(`${summary.pageErrors.length} page ${summary.pageErrors.length === 1 ? "error was" : "errors were"} observed while Pulse was active; review Debug data before using this as clean evidence.`)

  return (
    <section className={`mt-6 ${UI.panel} ${UI.reportInset}`}>
      <SectionTitle number="00" title="Runtime audit brief" />
      <p className={`${TYPE.body} mt-2 max-w-4xl`}>
        Browser-local evidence for what this site exposed during the current journey. Use it before and after consent,
        login, document upload, payment, account, or benefits flows to catch vendor drift and sensitive-context leakage.
      </p>
      <div className={`mt-4 ${UI.statStrip}`}>
        <Metric label="Third parties seen" value={watchingObservers} />
        <Metric label="Known vendors" value={identifiedObservers} />
        <Metric label="Unknown parties" value={unclassifiedParties} />
        <Metric label="Site-tool observers" value={siteToolObservers} />
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <Metric label="Recorded rows" value={allObservations.length} />
        <Metric label="Local state rows" value={localStateObservations.length} />
        <Metric label="Browser checks" value={exposureEvents.length} />
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <Metric label="Readable fields" value={exposedSignals.length} />
        <Metric label="Page errors" value={summary.pageErrors.length} />
      </div>
      <ul className={`${TYPE.body} mt-4 list-disc pl-5`}>
        {takeaways.map((takeaway, index) => <li key={`${takeaway}-${index}`}>{takeaway}</li>)}
      </ul>
    </section>
  )
}
