import { Fragment } from "react"

import Button from "~components/system/Button"
import { TYPE } from "~components/system/tokens"
import { blockingGuidance } from "~core/domain/blocking-policy"
import { getObserverRemediation } from "~core/domain/remediation"
import type { DisplayObservation } from "~core/report/display"
import {
  blockabilitySummary,
  detailEntries,
  displayEventKey,
  eventSummary,
  formatDetailKey,
  formatTime,
  observerName,
  titleCase
} from "~core/report/display"

export default function ObservationTable({
  blockedTrackerIds = [],
  observations,
  onToggleBlocking,
  readOnly = false
}: {
  blockedTrackerIds?: string[]
  observations: DisplayObservation[]
  onToggleBlocking?: (trackerId: string, blocked: boolean) => void
  readOnly?: boolean
}) {
  if (observations.length === 0) return <p className={TYPE.body}>No page observations have been recorded for this tab yet.</p>

  return (
    <div className="mt-3 overflow-x-auto border border-border bg-card">
      <table className="w-full min-w-[900px] border-collapse text-left">
        <thead>
          <tr className="border-b border-border bg-background/60">
            <th className={`${TYPE.label} p-3`}>Observer</th>
            <th className={`${TYPE.label} p-3`}>Evidence type</th>
            <th className={`${TYPE.label} p-3`}>Capability</th>
            <th className={`${TYPE.label} p-3`}>Count</th>
            <th className={`${TYPE.label} p-3`}>Latest</th>
            {readOnly ? null : <th className={`${TYPE.label} p-3`}>Action</th>}
          </tr>
        </thead>
        <tbody>
          {observations.map(({ event, count }) => {
            const remediation = getObserverRemediation(event)
            const guidance = blockingGuidance(event.trackerId)
            const canBlock =
              !readOnly &&
              Boolean(onToggleBlocking) &&
              event.blockability === "network_blockable" &&
              Boolean(event.trackerId) &&
              guidance.offerBlocking
            const isBlocked = canBlock && blockedTrackerIds.includes(event.trackerId as string)
            const details = detailEntries(event)

            return (
              <Fragment key={displayEventKey(event)}>
                <tr className="border-b border-border align-top">
                  <td className="p-3">
                    <p className={TYPE.body}>{remediation?.observerName ?? observerName(event)}</p>
                    <p className={`${TYPE.small} mt-1 break-all`}>{event.origin}</p>
                  </td>
                  <td className="p-3">
                    <p className={TYPE.body}>{titleCase(event.eventType)}</p>
                    <p className={`${TYPE.small} mt-1`}>
                      {titleCase(event.source)} · {titleCase(event.confidence)}
                    </p>
                  </td>
                  <td className="p-3">
                    <p className={TYPE.body}>{blockabilitySummary(event)}</p>
                    <p className={`${TYPE.small} mt-1`}>{titleCase(event.blockability)}</p>
                  </td>
                  <td className={`${TYPE.body} p-3`}>{count}</td>
                  <td className={`${TYPE.body} p-3`}>{formatTime(event.observedAt)}</td>
                  {readOnly ? null : (
                    <td className="p-3">
                      {/* user_action_required covers high-breakage trackers the
                          blocking policy never offers a toggle for — keep the
                          reason visible in the table too. */}
                      {(event.blockability === "network_blockable" || event.blockability === "user_action_required") &&
                      event.trackerId &&
                      !guidance.offerBlocking ? (
                        <p className={TYPE.small}>{"reason" in guidance ? guidance.reason : null}</p>
                      ) : null}
                      {canBlock && guidance.warning ? <p className={TYPE.small}>Blocking caution: {guidance.warning}</p> : null}
                      {canBlock ? (
                        <Button onClick={() => onToggleBlocking?.(event.trackerId as string, !isBlocked)}>
                          {isBlocked ? "Unblock" : "Block"}
                        </Button>
                      ) : (
                        <span className={TYPE.small}>No browser block</span>
                      )}
                    </td>
                  )}
                </tr>
                <tr className="border-b border-border bg-background/35">
                  <td className="p-3" colSpan={readOnly ? 5 : 6}>
                    <p className={`${TYPE.small} break-all`}>{event.evidence[0] ?? eventSummary(event)}</p>
                    {details.length > 0 ? (
                      <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[160px_1fr]">
                        {details.map(([key, value]) => (
                          <Fragment key={key}>
                            <dt className={TYPE.small}>{formatDetailKey(key)}</dt>
                            <dd className={`${TYPE.small} break-all`}>{String(value)}</dd>
                          </Fragment>
                        ))}
                      </dl>
                    ) : null}
                  </td>
                </tr>
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
