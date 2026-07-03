import "~style.css"

import { Fragment, useEffect, useState } from "react"
import browser from "webextension-polyfill"

import { RuntimeMessageSchema } from "~core/contracts/schemas"
import { getObserverRemediation } from "~core/domain/remediation"
import { isDiagnosticEvent } from "~core/state/summaries"
import type { AtomicSignalRow, DisplayObservation } from "~core/report/display"
import {
  EMPTY_SUMMARY,
  blockabilitySummary,
  buildAtomicSignalRows,
  buildCopyPayload,
  compactEvents,
  compactPageErrors,
  detailEntries,
  displayEventKey,
  eventSummary,
  exposureScanEvents,
  formatDetailKey,
  formatTime,
  observerName,
  parseSiteSummaryResponse,
  titleCase,
  visibleSignals
} from "~core/report/display"
import type { ObserverEvent, SiteSummary } from "~core/domain/types"
import type { UserSettings } from "~core/domain/types"
import Button from "~components/system/Button"
import SiteLogo from "~components/system/SiteLogo"
import { TYPE, UI } from "~components/system/tokens"

const EMPTY_SETTINGS: UserSettings = {
  retentionDays: 14,
  maxEventsPerTab: 100,
  blockedTrackerIds: [],
  mitigateCanvas: false,
  mitigateAudio: false,
  mitigateWebgl: false,
  skipReportOpenConfirm: false
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className={`${UI.panel} p-4`}>
      <div className={TYPE.label}>{label}</div>
      <div className="mt-2 font-display text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  )
}

function StatusChip({ status }: { status: ObserverEvent["status"] }) {
  return <span className="inline-flex border border-border bg-background/70 px-2 py-0.5 font-mono text-[0.6875rem] uppercase text-muted-foreground">{titleCase(status)}</span>
}

function SectionTitle({ number, title }: { number: string; title: string }) {
  return (
    <h2 className={TYPE.label}>
      <span className="text-signal">{number}</span>
      <span className="mx-2 text-border">/</span>
      {title}
    </h2>
  )
}

function AtomicSignalMatrix({ rows }: { rows: AtomicSignalRow[] }) {
  return (
    <section className={`mt-6 ${UI.panel} ${UI.reportInset}`}>
      <SectionTitle number="03" title="Atomic observe/block matrix" />
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border">
              <th className={`${TYPE.label} p-2`}>Signal</th>
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
                <td className={`${TYPE.body} p-2 text-muted-foreground`} colSpan={6}>No page-observed signals yet.</td>
              </tr>
            ) : rows.map((row) => (
              <tr className="border-b border-border last:border-b-0" key={row.signal}>
                <td className={`${TYPE.body} p-2`}>{titleCase(row.signal)}</td>
                <td className={`${TYPE.body} p-2`}>{row.observed ? "Yes" : "No"}</td>
                <td className="p-2"><StatusChip status={row.status} /></td>
                <td className={`${TYPE.body} p-2`}>{row.capability}</td>
                <td className={`${TYPE.body} p-2`}>{row.count}</td>
                <td className={`${TYPE.small} p-2`}>{row.latestEvidence}</td>
              </tr>
            ))}
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

function ExposureScanSection({ events }: { events: ObserverEvent[] }) {
  return (
    <section className={`mt-6 ${UI.panel} ${UI.reportInset}`}>
      <SectionTitle number="02" title="Exposure scan" />
      <p className={`${TYPE.small} mt-2`}>
        This section shows what Pulse Observer could read locally from browser APIs. It does not prove the current website used these fields.
      </p>
      <div className="mt-4 space-y-4">
        {events.length === 0 ? <p className={TYPE.body}>No extension exposure scan events have been recorded for this tab yet.</p> : events.map((event) => (
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
              {event.evidence.map((evidence) => <li key={evidence}>{evidence}</li>)}
            </ul>
          </article>
        ))}
      </div>
    </section>
  )
}

function ObservationTable({
  blockedTrackerIds,
  observations,
  onToggleBlocking
}: { blockedTrackerIds: string[]; observations: DisplayObservation[]; onToggleBlocking: (trackerId: string, blocked: boolean) => void }) {
  if (observations.length === 0) return <p className={TYPE.body}>No page observations have been recorded for this tab yet.</p>

  return (
    <div className="mt-3 overflow-x-auto border border-border bg-card">
      <table className="w-full min-w-[900px] border-collapse text-left">
        <thead>
          <tr className="border-b border-border bg-background/60">
            <th className={`${TYPE.label} p-3`}>Observer</th>
            <th className={`${TYPE.label} p-3`}>Signal</th>
            <th className={`${TYPE.label} p-3`}>Capability</th>
            <th className={`${TYPE.label} p-3`}>Count</th>
            <th className={`${TYPE.label} p-3`}>Latest</th>
            <th className={`${TYPE.label} p-3`}>Action</th>
          </tr>
        </thead>
        <tbody>
          {observations.map(({ event, count }) => {
            const remediation = getObserverRemediation(event)
            const canBlock = event.blockability === "network_blockable" && Boolean(event.trackerId)
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
                    <p className={`${TYPE.small} mt-1`}>{titleCase(event.source)} · {titleCase(event.confidence)}</p>
                  </td>
                  <td className="p-3">
                    <p className={TYPE.body}>{blockabilitySummary(event)}</p>
                    <p className={`${TYPE.small} mt-1`}>{titleCase(event.blockability)}</p>
                  </td>
                  <td className={`${TYPE.body} p-3`}>{count}</td>
                  <td className={`${TYPE.body} p-3`}>{formatTime(event.observedAt)}</td>
                  <td className="p-3">
                    {canBlock ? (
                      <Button onClick={() => onToggleBlocking(event.trackerId as string, !isBlocked)}>
                        {isBlocked ? "Unblock" : "Block"}
                      </Button>
                    ) : <span className={TYPE.small}>No browser block</span>}
                  </td>
                </tr>
                <tr className="border-b border-border bg-background/35">
                  <td className="p-3" colSpan={6}>
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

function EvidenceTimeline({ events }: { events: ObserverEvent[] }) {
  const observations = compactEvents(events.filter((event) => !isDiagnosticEvent(event) && event.source !== "extension-scan"))

  return (
    <section className={`mt-6 ${UI.panel} ${UI.reportInset}`}>
      <SectionTitle number="06" title="Evidence timeline" />
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

function RemediationPanel({ observations }: { observations: DisplayObservation[] }) {
  const remediationItems = observations
    .map(({ event, count }) => ({ event, count, remediation: getObserverRemediation(event) }))
    .filter((item) => item.remediation)

  return (
    <section className={`mt-6 ${UI.panel} ${UI.reportInset}`}>
      <SectionTitle number="05" title="Stop at source" />
      {remediationItems.length === 0 ? <p className={`${TYPE.body} mt-3`}>No source-level remediation path is known for the current observations.</p> : (
        <div className="mt-4 space-y-3">
          {remediationItems.map(({ event, remediation }) => remediation ? (
            <article className={`${UI.subtlePanel} p-4`} key={displayEventKey(event)}>
              <h3 className="font-display text-base font-semibold tracking-tight">{remediation.observerName}</h3>
              <p className={`${TYPE.small} mt-1`}>{remediation.parentCompany} · {remediation.categoryLabels.join(" · ")}</p>
              <dl className="mt-4 grid gap-x-5 gap-y-2 sm:grid-cols-[180px_1fr]">
                <dt className={TYPE.small}>Collects</dt>
                <dd className={TYPE.body}>{remediation.collects.join(", ")}</dd>
                <dt className={TYPE.small}>Used for</dt>
                <dd className={TYPE.body}>{remediation.monetization.join(", ")}</dd>
                <dt className={TYPE.small}>Friction</dt>
                <dd className={TYPE.body}>{titleCase(remediation.frictionClass)} · about {remediation.estimatedTimeMinutes} min</dd>
                <dt className={TYPE.small}>Recheck</dt>
                <dd className={TYPE.body}>{remediation.recheckIntervalDays} days</dd>
              </dl>
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

function DiagnosticsPanel({ summary }: { summary: SiteSummary }) {
  const diagnostics = summary.events.filter(isDiagnosticEvent)
  const pageErrors = compactPageErrors(summary.pageErrors)

  return (
    <section className={`mt-6 ${UI.panel} ${UI.reportInset}`}>
      <SectionTitle number="07" title="Diagnostics" />
      <dl className="mt-3 grid gap-2 sm:grid-cols-[160px_1fr]">
        <dt className={TYPE.small}>Tab</dt>
        <dd className={TYPE.body}>{summary.tabId}</dd>
        <dt className={TYPE.small}>Updated</dt>
        <dd className={TYPE.body}>{formatTime(summary.updatedAt)}</dd>
        <dt className={TYPE.small}>Incomplete</dt>
        <dd className={TYPE.body}>{summary.incomplete ? "Yes" : "No"}</dd>
        <dt className={TYPE.small}>Visible signals</dt>
        <dd className={TYPE.body}>{visibleSignals(summary).map(titleCase).join(", ") || "None"}</dd>
      </dl>
      {pageErrors.length > 0 ? (
        <div className="mt-4 border-t border-border pt-4">
          <h3 className={TYPE.label}>Page errors while active</h3>
          <ul className={`${TYPE.small} mt-2 list-disc pl-4`}>
            {pageErrors.map(({ pageError, count }) => <li key={pageError.id}>{pageError.message}{count > 1 ? ` × ${count}` : ""} · {formatTime(pageError.observedAt)}</li>)}
          </ul>
        </div>
      ) : null}
      {diagnostics.length > 0 ? (
        <div className="mt-4 border-t border-border pt-4">
          <h3 className={TYPE.label}>Extension diagnostics</h3>
          <ul className={`${TYPE.small} mt-2 list-disc pl-4`}>
            {diagnostics.map((event) => <li key={event.id}>{event.evidence[0] ?? eventSummary(event)} · {formatTime(event.observedAt)}</li>)}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

function ReportTab() {
  const [summary, setSummary] = useState<SiteSummary>(EMPTY_SUMMARY)
  const [settings, setSettings] = useState<UserSettings>(EMPTY_SETTINGS)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle")

  useEffect(() => {
    async function loadSummary() {
      const params = new URLSearchParams(location.search)
      const tabIdParam = Number(params.get("tabId"))
      const tabId = Number.isFinite(tabIdParam) && tabIdParam > 0 ? tabIdParam : undefined

      if (!tabId) {
        setLoadError("No source tab was supplied for this report.")
        return
      }

      const response = await browser.runtime.sendMessage({ type: "GET_SITE_SUMMARY", tabId })
      const parsed = parseSiteSummaryResponse(response)
      if (!parsed.success) {
        setLoadError(`Background returned a malformed site summary: ${parsed.error.issues.map((issue) => issue.path.join(".") || issue.message).join(", ")}`)
        return
      }

      setSummary(parsed.data)
      setLoadError(null)
    }

    async function loadSettings() {
      const response = await browser.runtime.sendMessage({ type: "GET_SETTINGS" })
      const parsed = RuntimeMessageSchema.safeParse(response)
      if (parsed.success && parsed.data.type === "SETTINGS") setSettings(parsed.data.payload)
    }

    loadSummary().catch((error: unknown) => setLoadError(error instanceof Error ? error.message : String(error)))
    loadSettings().catch(() => undefined)
  }, [])

  async function toggleTrackerBlocking(trackerId: string, blocked: boolean) {
    const blockedTrackerIds = blocked
      ? [...new Set([...settings.blockedTrackerIds, trackerId])]
      : settings.blockedTrackerIds.filter((id) => id !== trackerId)

    setSettings((current) => ({ ...current, blockedTrackerIds }))
    await browser.runtime.sendMessage({ type: "UPDATE_SETTINGS", payload: { blockedTrackerIds } }).catch(() => undefined)
  }

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(buildCopyPayload(summary))
      setCopyState("copied")
      setTimeout(() => setCopyState("idle"), 1600)
    } catch {
      setCopyState("failed")
      setTimeout(() => setCopyState("idle"), 2200)
    }
  }

  const observations = compactEvents(summary.events)
  const rows = buildAtomicSignalRows(summary.events)
  const exposureEvents = exposureScanEvents(summary.events)

  return (
    <main className="min-h-screen bg-background p-6 font-body text-foreground">
      <div className="mx-auto max-w-6xl">
        <header className={`${UI.panel} flex flex-wrap items-start justify-between gap-4 p-5`}>
          <div>
            <SiteLogo textClass="text-xl" sublabel="Pulse Observer report" />
            <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight">Current tab evidence</h1>
            <p className={`${TYPE.body} mt-2 break-all`}>{summary.origin}</p>
          </div>
          <Button onClick={() => copyReport().catch(() => setCopyState("failed"))}>
            {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy report"}
          </Button>
        </header>

        {loadError ? (
          <section className="mt-6 border border-danger bg-card p-4" role="alert">
            <h2 className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-danger">Report load failed</h2>
            <p className={`${TYPE.body} mt-2 break-words`}>{loadError}</p>
          </section>
        ) : null}

        <section aria-label="Report summary" className={`mt-6 ${UI.panel} ${UI.reportInset}`}>
          <SectionTitle number="01" title="Summary" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <Metric label="Signals" value={rows.length} />
            <Metric label="Events" value={summary.events.filter((event) => !isDiagnosticEvent(event) && event.source !== "extension-scan").length} />
            <Metric label="Exposure" value={exposureEvents.length} />
            <Metric label="Active" value={summary.activeCompanies.length} />
            <Metric label="Blocked" value={summary.blockedCompanies.length} />
            <Metric label="Cannot" value={summary.cannotBlockSignals.length} />
          </div>
        </section>

        <ExposureScanSection events={exposureEvents} />
        <AtomicSignalMatrix rows={rows} />

        <section className="mt-6">
          <SectionTitle number="04" title="Observer details" />
          <ObservationTable blockedTrackerIds={settings.blockedTrackerIds} observations={observations} onToggleBlocking={toggleTrackerBlocking} />
        </section>

        <RemediationPanel observations={observations} />
        <EvidenceTimeline events={summary.events} />
        <DiagnosticsPanel summary={summary} />
      </div>
    </main>
  )
}

export default ReportTab