import { TYPE, UI } from "~components/system/tokens"
import type { SiteSummary, UserSettings } from "~core/domain/types"
import { compactPageErrors, diagnosticEvents, formatTime, observerName } from "~core/report/display"
import { summaryMetrics } from "~core/report/metrics"
import { DEBUG_METRICS, metricItems } from "~core/report/surface-metrics"

// The fail-open surface (docs/surface-contract.md): raw reality for
// diagnosing the pipeline from the UI, never curated for presentation. This
// is the ONE file where pipeline vocabulary (events, observations, evidence
// tiers, exposure scans, diagnostics) is allowed to reach the screen — the
// product surfaces speak the user's language; this one speaks ours.
// If the popup or report ever looks wrong, this view answers "did the
// pipeline see it?" without a debugger.

function MetricCatalog({ summary }: { summary: SiteSummary }) {
  const items = metricItems(summaryMetrics(summary), DEBUG_METRICS)

  return (
    <section className={`mt-6 ${UI.panel} ${UI.reportInset}`}>
      <h2 className={TYPE.label}>Every metric, with its definition</h2>
      <dl className="mt-3 grid gap-x-5 gap-y-2 sm:grid-cols-[140px_56px_1fr]">
        {items.map((item) => (
          <div className="contents" key={`${item.field}:${item.label}`}>
            <dt className={TYPE.small}>{item.label}</dt>
            <dd className="font-display text-sm font-semibold tabular-nums">{item.value}</dd>
            <dd className={TYPE.small}>{item.title}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function RawEventStream({ summary, settings }: { summary: SiteSummary; settings: UserSettings }) {
  const events = [...summary.events].sort((left, right) => right.observedAt - left.observedAt)

  return (
    <section className={`mt-6 ${UI.tableShell}`}>
      <h2 className={TYPE.label}>Raw event stream</h2>
      <p className={`${TYPE.small} mt-2`}>
        Every stored event for this tab, newest first — all sources and evidence tiers, including extension diagnostics and exposure scans.
        Retaining {summary.events.length} of a {settings.maxEventsPerTab}-event cap; observed-tier evidence evicts first when the cap is
        hit.
      </p>
      <table className="mt-3 w-full min-w-[720px] text-left">
        <thead>
          <tr className={`${TYPE.small} ${UI.tableHeader}`}>
            <th className="p-2">Observed</th>
            <th className="p-2">Party</th>
            <th className="p-2">Event type</th>
            <th className="p-2">Source</th>
            <th className="p-2">Tier</th>
            <th className="p-2">Status</th>
            <th className="p-2">Count</th>
            <th className="p-2">First-party</th>
          </tr>
        </thead>
        <tbody>
          {events.length === 0 ? (
            <tr>
              <td className={`${TYPE.small} p-2`} colSpan={8}>
                No events stored for this tab.
              </td>
            </tr>
          ) : (
            events.map((event) => (
              <tr className={UI.tableRow} key={event.id} title={event.evidence[0]}>
                <td className={`${TYPE.small} p-2 whitespace-nowrap`}>{formatTime(event.observedAt)}</td>
                <td className={`${TYPE.body} break-all p-2`}>{observerName(event)}</td>
                <td className={`${TYPE.mono} p-2`}>{event.eventType}</td>
                <td className={`${TYPE.mono} p-2`}>{event.source}</td>
                <td className={`${TYPE.mono} p-2`}>{event.evidenceTier ?? "—"}</td>
                <td className={`${TYPE.mono} p-2`}>{event.status}</td>
                <td className={`${TYPE.body} p-2 tabular-nums`}>{event.count ?? 1}</td>
                <td className={`${TYPE.mono} p-2`}>{event.firstParty ? "yes" : "no"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  )
}

function DiagnosticsAndErrors({ summary }: { summary: SiteSummary }) {
  const diagnostics = diagnosticEvents(summary.events)
  const pageErrors = compactPageErrors(summary.pageErrors)

  return (
    <section className={`mt-6 ${UI.panel} ${UI.reportInset}`}>
      <h2 className={TYPE.label}>Extension diagnostics and page errors</h2>
      <dl className="mt-3 grid gap-2 sm:grid-cols-[160px_1fr]">
        <dt className={TYPE.small}>Tab</dt>
        <dd className={TYPE.body}>{summary.tabId}</dd>
        <dt className={TYPE.small}>Origin</dt>
        <dd className={`${TYPE.body} break-all`}>{summary.origin}</dd>
        <dt className={TYPE.small}>Updated</dt>
        <dd className={TYPE.body}>{formatTime(summary.updatedAt)}</dd>
        <dt className={TYPE.small}>Incomplete</dt>
        <dd className={TYPE.body}>{summary.incomplete ? "Yes" : "No"}</dd>
      </dl>
      {diagnostics.length > 0 ? (
        <div className="mt-4 border-t border-border pt-4">
          <h3 className={TYPE.label}>Diagnostics</h3>
          <ul className={`${TYPE.small} mt-2 list-disc pl-4`}>
            {diagnostics.map((event) => (
              <li key={event.id}>
                {event.evidence[0]} · {formatTime(event.observedAt)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {pageErrors.length > 0 ? (
        <div className="mt-4 border-t border-border pt-4">
          <h3 className={TYPE.label}>Page errors while active</h3>
          <ul className={`${TYPE.small} mt-2 list-disc pl-4`}>
            {pageErrors.map(({ pageError, count }) => (
              <li key={pageError.id}>
                {pageError.message}
                {count > 1 ? ` × ${count}` : ""} · {formatTime(pageError.observedAt)}
                {pageError.stackPreview ? (
                  <pre className="mt-1 whitespace-pre-wrap break-words text-[0.625rem]">{pageError.stackPreview}</pre>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

export default function DebugView({ summary, settings }: { summary: SiteSummary; settings: UserSettings }) {
  return (
    <>
      <MetricCatalog summary={summary} />
      <RawEventStream settings={settings} summary={summary} />
      <DiagnosticsAndErrors summary={summary} />
    </>
  )
}
