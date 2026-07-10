import type { ObserverEvent } from "~core/domain/types"
import { blockabilitySummary, compactEvents, displayEventKey, eventSummary, formatTime, titleCase } from "~core/report/display"
import { TYPE, UI } from "~components/system/tokens"

import { SectionTitle } from "~components/report/shared"

export default function EvidenceTimeline({ embedded = false, events }: { embedded?: boolean; events: ObserverEvent[] }) {
  const observations = compactEvents(events.filter((event) => event.source !== "extension-scan"))

  return (
    <section className={embedded ? "mt-4" : `mt-6 ${UI.panel} ${UI.reportInset}`}>
      {embedded ? null : <SectionTitle number="06" title="Timeline" />}
      <div className="mt-3 space-y-3">
        {observations.length === 0 ? <p className={TYPE.body}>No evidence events have been recorded for this tab yet.</p> : observations.map(({ event, count }) => (
          <div className="grid gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0 sm:grid-cols-[120px_1fr]" key={displayEventKey(event)}>
            <p className={TYPE.small}>{formatTime(event.observedAt)}</p>
            <div>
              <p className={TYPE.body}>{titleCase(event.eventType)} · {blockabilitySummary(event)}</p>
              {count > 1 ? <p className={`${TYPE.small} mt-1`}>Observed {count} times. Showing the latest evidence for this observer and signal.</p> : null}
              <p className={`${TYPE.small} mt-1 break-all`}>{event.evidence[0] ?? eventSummary(event)}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
