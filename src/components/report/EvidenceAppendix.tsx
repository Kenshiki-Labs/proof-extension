import { Fragment } from "react"

import { SectionTitle, StatusChip } from "~components/report/shared"
import { TYPE, UI } from "~components/system/tokens"
import type { ObserverEvent } from "~core/domain/types"
import type { AtomicSignalRow, DisplayObservation } from "~core/report/display"
import {
  blockabilitySummary,
  detailEntries,
  displayEventKey,
  eventSummary,
  formatDetailKey,
  formatTime,
  titleCase
} from "~core/report/display"

export function AtomicSignalMatrix({ rows }: { rows: AtomicSignalRow[] }) {
  return (
    <section className={`mt-6 ${UI.panel} ${UI.reportInset}`}>
      <SectionTitle number="06" title="Evidence types seen — and what can be done" />
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border">
              <th className={`${TYPE.label} p-2`}>Evidence type</th>
              <th className={`${TYPE.label} p-2`}>Observed</th>
              <th className={`${TYPE.label} p-2`}>Status</th>
              <th className={`${TYPE.label} p-2`}>Capability</th>
              <th className={`${TYPE.label} p-2`}>Count</th>
              <th className={`${TYPE.label} p-2`}>Latest evidence</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className={`${TYPE.body} p-2 text-muted-foreground`} colSpan={6}>
                  No page-observed evidence types yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr className="border-b border-border last:border-b-0" key={row.signal}>
                  <td className={`${TYPE.body} p-2`}>{titleCase(row.signal)}</td>
                  <td className={`${TYPE.body} p-2`}>{row.observed ? "Yes" : "No"}</td>
                  <td className="p-2">
                    <StatusChip status={row.status} />
                  </td>
                  <td className={`${TYPE.body} p-2`}>{row.capability}</td>
                  <td className={`${TYPE.body} p-2`}>{row.count}</td>
                  <td className={`${TYPE.small} p-2`}>{row.latestEvidence}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function exposureTitle(event: ObserverEvent) {
  if (event.eventType === "browser_surface" && event.details?.apiGroup === "rendering_media") return "Rendering and media surface"
  if (event.eventType === "browser_surface") return "Device and browser surface"
  return titleCase(event.eventType)
}

export function ExposureScanSection({ events }: { events: ObserverEvent[] }) {
  return (
    <section className={`mt-6 ${UI.panel} ${UI.reportInset}`}>
      <SectionTitle number="05" title="What could be read about you" />
      <p className={`${TYPE.small} mt-2`}>
        This section shows what Pulse Observer could read locally from browser APIs. It does not prove the current website used these
        fields.
      </p>
      <div className="mt-4 space-y-4">
        {events.length === 0 ? (
          <p className={TYPE.body}>No extension exposure scan events have been recorded for this tab yet.</p>
        ) : (
          events.map((event) => (
            <article className={`${UI.subtlePanel} p-4`} key={displayEventKey(event)}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-base font-semibold tracking-tight">{exposureTitle(event)}</h3>
                  <p className={`${TYPE.small} mt-1`}>{eventSummary(event)}</p>
                </div>
                <StatusChip status={event.status} />
              </div>
              <dl className="mt-4 grid gap-x-5 gap-y-2 sm:grid-cols-[180px_1fr]">
                <dt className={TYPE.small}>Observed</dt>
                <dd className={TYPE.body}>{formatTime(event.observedAt)}</dd>
                <dt className={TYPE.small}>Capability</dt>
                <dd className={TYPE.body}>{blockabilitySummary(event)}</dd>
                {detailEntries(event).map(([key, value]) => (
                  <Fragment key={key}>
                    <dt className={TYPE.small}>{formatDetailKey(key)}</dt>
                    <dd className={`${TYPE.body} break-all`}>{String(value)}</dd>
                  </Fragment>
                ))}
              </dl>
              <ul className={`${TYPE.small} mt-4 list-disc border-t border-border pl-4 pt-3`}>
                {event.evidence.map((evidence, index) => (
                  <li key={`${evidence}-${index}`}>{evidence}</li>
                ))}
              </ul>
            </article>
          ))
        )}
      </div>
    </section>
  )
}

export function LocalPageSignalsSection({ observations }: { observations: DisplayObservation[] }) {
  return (
    <section className={`mt-6 ${UI.panel} ${UI.reportInset}`}>
      <SectionTitle number="05b" title="Local page processing" />
      <p className={`${TYPE.small} mt-2`}>
        First-party code can prepare privacy-choice plumbing or identifier hashes before a third-party request is visible. Values are not
        recorded.
      </p>
      <div className="mt-4 space-y-4">
        {observations.length === 0 ? (
          <p className={TYPE.body}>No local page processing rows have been recorded for this tab yet.</p>
        ) : (
          observations.map(({ event, count }) => (
            <article className={`${UI.subtlePanel} p-4`} key={displayEventKey(event)}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-base font-semibold tracking-tight">{titleCase(event.eventType)}</h3>
                  <p className={`${TYPE.small} mt-1`}>{eventSummary(event)}</p>
                </div>
                <StatusChip status={event.status} />
              </div>
              <dl className="mt-4 grid gap-x-5 gap-y-2 sm:grid-cols-[180px_1fr]">
                <dt className={TYPE.small}>Rows grouped</dt>
                <dd className={TYPE.body}>{count}</dd>
                <dt className={TYPE.small}>Observed</dt>
                <dd className={TYPE.body}>{formatTime(event.observedAt)}</dd>
                <dt className={TYPE.small}>Capability</dt>
                <dd className={TYPE.body}>{blockabilitySummary(event)}</dd>
                {detailEntries(event).map(([key, value]) => (
                  <Fragment key={key}>
                    <dt className={TYPE.small}>{formatDetailKey(key)}</dt>
                    <dd className={`${TYPE.body} break-all`}>{String(value)}</dd>
                  </Fragment>
                ))}
              </dl>
              <ul className={`${TYPE.small} mt-4 list-disc border-t border-border pl-4 pt-3`}>
                {event.evidence.map((evidence, index) => (
                  <li key={`${evidence}-${index}`}>{evidence}</li>
                ))}
              </ul>
            </article>
          ))
        )}
      </div>
    </section>
  )
}
