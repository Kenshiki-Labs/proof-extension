import "~style.css"

import { Fragment, useEffect, useState } from "react"
import browser from "webextension-polyfill"

import { RuntimeMessageSchema, SiteSummarySchema } from "~core/contracts/schemas"
import { getObserverRemediation } from "~core/domain/remediation"
import type { ObserverEvent, SiteSummary, UserSettings } from "~core/domain/types"
import Button from "~components/system/Button"
import { TYPE } from "~components/system/tokens"

const EMPTY_SUMMARY: SiteSummary = {
  origin: "unknown",
  tabId: -1,
  activeCompanies: [],
  blockedCompanies: [],
  mitigatedCompanies: [],
  exposedSignals: [],
  cannotBlockSignals: [],
  events: [],
  pageErrors: [],
  incomplete: true,
  updatedAt: 0
}

const EMPTY_SETTINGS: UserSettings = {
  retentionDays: 14,
  maxEventsPerTab: 100,
  blockedTrackerIds: [],
  mitigateCanvas: false,
  mitigateAudio: false,
  mitigateWebgl: false
}

const STATUS_LABELS: Record<ObserverEvent["status"], string> = {
  active: "Still exposed",
  blocked: "Blocked",
  mitigated: "Mitigated",
  cannot_block: "Cannot block"
}

// Muted, low-saturation status colors — cold and factual, not celebratory.
const STATUS_CLASSES: Record<ObserverEvent["status"], string> = {
  active: "border-amber-700 text-amber-700",
  blocked: "border-emerald-700 text-emerald-700",
  mitigated: "border-sky-700 text-sky-700",
  cannot_block: "border-border text-muted-foreground"
}

type DisplayObservation = {
  event: ObserverEvent
  count: number
}

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function observerName(event: ObserverEvent) {
  return event.companyId ?? event.trackerId ?? (event.firstParty ? "First-party script" : "Unknown observer")
}

function isDiagnosticEvent(event: ObserverEvent) {
  return event.eventType === "script_injected"
}

function visibleSignals(summary: SiteSummary) {
  return summary.exposedSignals.filter((signal) => signal !== "script_injected")
}

function displayEventKey(event: ObserverEvent) {
  return [
    event.companyId ?? "",
    event.trackerId ?? "",
    event.firstParty ? event.origin : "",
    event.eventType,
    event.source,
    event.status,
    event.blockability
  ].join("|")
}

function compactEvents(events: ObserverEvent[]): DisplayObservation[] {
  const observations = new Map<string, DisplayObservation>()

  for (const event of events) {
    if (isDiagnosticEvent(event)) continue

    const key = displayEventKey(event)
    const existing = observations.get(key)
    if (!existing) {
      observations.set(key, { event, count: 1 })
      continue
    }

    observations.set(key, {
      event: event.observedAt >= existing.event.observedAt ? event : existing.event,
      count: existing.count + 1
    })
  }

  return [...observations.values()].sort((left, right) => right.event.observedAt - left.event.observedAt)
}

function eventSummary(event: ObserverEvent) {
  if (event.eventType === "canvas_read") return "Canvas data was read by page script."
  if (event.eventType === "webgl_query") return "WebGL rendering details were queried."
  if (event.eventType === "audio_fingerprint") return "Audio rendering behavior was sampled."
  if (event.eventType === "font_enumeration") return "Font surface was enumerated."
  if (event.eventType === "request_blocked") return "A tracker network request was blocked."
  if (event.eventType === "request_seen") return "A tracker network request was observed."
  return `${titleCase(event.eventType)} observed.`
}

function formatDetailKey(value: string) {
  return titleCase(value).replace(/^Url$/, "URL").replace(/^Id$/, "ID")
}

function detailEntries(event: ObserverEvent) {
  return Object.entries(event.details ?? {}).filter(([, value]) => value !== "")
}

function formatTime(timestamp: number) {
  if (!timestamp) return "Unknown"
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(timestamp)
}

function buildCopyPayload(summary: SiteSummary) {
  const observations = compactEvents(summary.events)

  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      origin: summary.origin,
      tabId: summary.tabId,
      incomplete: summary.incomplete,
      counts: {
        observations: observations.length,
        rawEvents: summary.events.length,
        activeCompanies: summary.activeCompanies.length,
        blockedCompanies: summary.blockedCompanies.length,
        mitigatedCompanies: summary.mitigatedCompanies.length,
        exposedSignals: summary.exposedSignals.filter((signal) => signal !== "script_injected").length,
        cannotBlockSignals: summary.cannotBlockSignals.length
      },
      observations: observations.map(({ event, count }) => formatCopyEvent(event, count)),
      rawEvents: summary.events.map((event) => formatCopyEvent(event, 1))
    },
    null,
    2
  )
}

function formatCopyEvent(event: ObserverEvent, count: number) {
  const remediation = getObserverRemediation(event)

  return {
    id: event.id,
    count,
    lastObservedAt: new Date(event.observedAt).toISOString(),
    observer: remediation?.observerName ?? observerName(event),
    parentCompany: remediation?.parentCompany,
    origin: event.origin,
    signal: event.eventType,
    source: event.source,
    status: event.status,
    blockability: event.blockability,
    confidence: event.confidence,
    firstParty: event.firstParty,
    policyLabel: event.policyLabel,
    trackerId: event.trackerId,
    companyId: event.companyId,
    frameId: event.frameId,
    details: event.details,
    evidence: event.evidence,
    remediation
  }
}

function parseSiteSummaryResponse(response: unknown) {
  const payload =
    response && typeof response === "object" && "type" in response && response.type === "SITE_SUMMARY" && "payload" in response
      ? response.payload
      : response
  const normalizedPayload = payload && typeof payload === "object" ? { pageErrors: [], ...payload } : payload
  return SiteSummarySchema.safeParse(normalizedPayload)
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 border border-border bg-card p-3">
      <div className={TYPE.label}>{label}</div>
      <div className="mt-1 text-xl font-bold">{value}</div>
    </div>
  )
}

function CompactList({ emptyLabel, items }: { emptyLabel: string; items: string[] }) {
  if (items.length === 0) return <span className="text-muted-foreground">{emptyLabel}</span>
  return <span>{items.join(", ")}</span>
}

function ObserverCard({
  count,
  event,
  blockedTrackerIds,
  onToggleBlocking
}: DisplayObservation & { blockedTrackerIds: string[]; onToggleBlocking: (trackerId: string, blocked: boolean) => void }) {
  const remediation = getObserverRemediation(event)
  const canBlock = event.blockability === "network_blockable" && Boolean(event.trackerId)
  const isBlocked = canBlock && blockedTrackerIds.includes(event.trackerId as string)
  const details = detailEntries(event)

  return (
    <article className="mt-2.5 border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <strong className="text-sm">{remediation?.observerName ?? observerName(event)}</strong>
        <div className="flex items-center gap-1.5">
          <span className={`rounded-full border px-2 py-0.5 text-[0.625rem] uppercase ${STATUS_CLASSES[event.status]}`}>
            {STATUS_LABELS[event.status]}
          </span>
          {canBlock ? (
            <button
              type="button"
              onClick={() => onToggleBlocking(event.trackerId as string, !isBlocked)}
              title={isBlocked ? "Unblock this tracker's network requests" : "Block this tracker's network requests"}
              className={`rounded-full border px-2 py-0.5 text-[0.625rem] uppercase transition-colors ${
                isBlocked
                  ? "border-danger text-danger hover:bg-danger hover:text-background"
                  : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
              }`}>
              {isBlocked ? "Unblock" : "Block"}
            </button>
          ) : null}
        </div>
      </div>
      {remediation ? <p className={`${TYPE.small} mt-1`}>{remediation.parentCompany} · {remediation.categoryLabels.join(" · ")}</p> : null}
      <p className={`${TYPE.body} mt-2`}>{eventSummary(event)}</p>
      {count > 1 ? <p className={`${TYPE.small} mt-1`}>Observed {count} times in this tab. Showing the latest instance.</p> : null}
      <dl className="mt-2.5 grid grid-cols-[96px_1fr] gap-1.5">
        <dt className={TYPE.small}>Observed</dt>
        <dd className={TYPE.body}>{formatTime(event.observedAt)}</dd>
        <dt className={TYPE.small}>Origin</dt>
        <dd className={`${TYPE.body} break-all`}>{event.origin}</dd>
        <dt className={TYPE.small}>Signal</dt>
        <dd className={TYPE.body}>{titleCase(event.eventType)}</dd>
        <dt className={TYPE.small}>Source</dt>
        <dd className={TYPE.body}>{titleCase(event.source)}</dd>
        <dt className={TYPE.small}>Party</dt>
        <dd className={TYPE.body}>{event.firstParty ? "First party" : "Third party"}</dd>
        <dt className={TYPE.small}>Confidence</dt>
        <dd className={TYPE.body}>{titleCase(event.confidence)}</dd>
        <dt className={TYPE.small}>Blockability</dt>
        <dd className={TYPE.body}>{titleCase(event.blockability)}</dd>
        {event.policyLabel ? (
          <>
            <dt className={TYPE.small}>Policy</dt>
            <dd className={TYPE.body}>{titleCase(event.policyLabel)}</dd>
          </>
        ) : null}
        {event.trackerId ? (
          <>
            <dt className={TYPE.small}>Tracker ID</dt>
            <dd className={TYPE.body}>{event.trackerId}</dd>
          </>
        ) : null}
        {event.companyId ? (
          <>
            <dt className={TYPE.small}>Company ID</dt>
            <dd className={TYPE.body}>{event.companyId}</dd>
          </>
        ) : null}
        {event.frameId !== undefined ? (
          <>
            <dt className={TYPE.small}>Frame</dt>
            <dd className={TYPE.body}>{event.frameId}</dd>
          </>
        ) : null}
        {details.map(([key, value]) => (
          <Fragment key={key}>
            <dt className={TYPE.small}>{formatDetailKey(key)}</dt>
            <dd className={`${TYPE.body} break-all`}>{String(value)}</dd>
          </Fragment>
        ))}
      </dl>
      {event.evidence.length > 0 ? (
        <ul className={`${TYPE.small} mt-2.5 list-disc pl-4`}>
          {event.evidence.map((evidence) => (
            <li key={evidence}>{evidence}</li>
          ))}
        </ul>
      ) : null}
      {remediation ? (
        <section className="mt-3 border-t border-border pt-3">
          <h3 className={TYPE.label}>Stop at source</h3>
          <dl className="mt-2 grid grid-cols-[104px_1fr] gap-1.5">
            <dt className={TYPE.small}>Collects</dt>
            <dd className={TYPE.body}>{remediation.collects.join(", ")}</dd>
            <dt className={TYPE.small}>Used for</dt>
            <dd className={TYPE.body}>{remediation.monetization.join(", ")}</dd>
            <dt className={TYPE.small}>Friction</dt>
            <dd className={TYPE.body}>{titleCase(remediation.frictionClass)} · about {remediation.estimatedTimeMinutes} min</dd>
            <dt className={TYPE.small}>Verify ID</dt>
            <dd className={TYPE.body}>{remediation.identityVerificationRequired ? "Required" : "Not required"}</dd>
          </dl>
          <div className="mt-3 flex flex-wrap gap-2">
            <a className={`${TYPE.label} underline`} href={remediation.futureCollectionUrl} rel="noreferrer" target="_blank">
              Opt out
            </a>
            <a className={`${TYPE.label} underline`} href={remediation.deletionUrl} rel="noreferrer" target="_blank">
              Request deletion
            </a>
          </div>
          <p className={`${TYPE.small} mt-2`}>Blocking does not delete prior records. {remediation.notes}</p>
        </section>
      ) : null}
    </article>
  )
}

function DiagnosticsSection({ diagnostics, summary }: { diagnostics: ObserverEvent[]; summary: SiteSummary }) {
  const latestDiagnostics = diagnostics.slice(-4).reverse()

  return (
    <section className="mt-4 border border-border bg-card p-3">
      <h2 className={TYPE.label}>Runtime details</h2>
      <dl className="mt-2 grid grid-cols-[112px_1fr] gap-1.5">
        <dt className={TYPE.small}>Tab</dt>
        <dd className={TYPE.body}>{summary.tabId}</dd>
        <dt className={TYPE.small}>Updated</dt>
        <dd className={TYPE.body}>{formatTime(summary.updatedAt)}</dd>
        <dt className={TYPE.small}>Raw events</dt>
        <dd className={TYPE.body}>{summary.events.length}</dd>
        <dt className={TYPE.small}>Signals</dt>
        <dd className={TYPE.body}><CompactList emptyLabel="None yet" items={visibleSignals(summary).map(titleCase)} /></dd>
        <dt className={TYPE.small}>Active</dt>
        <dd className={`${TYPE.body} break-all`}><CompactList emptyLabel="None" items={summary.activeCompanies} /></dd>
        <dt className={TYPE.small}>Blocked</dt>
        <dd className={`${TYPE.body} break-all`}><CompactList emptyLabel="None" items={summary.blockedCompanies} /></dd>
        <dt className={TYPE.small}>Mitigated</dt>
        <dd className={`${TYPE.body} break-all`}><CompactList emptyLabel="None" items={summary.mitigatedCompanies} /></dd>
      </dl>
      {latestDiagnostics.length > 0 ? (
        <div className="mt-3 border-t border-border pt-3">
          <h3 className={TYPE.label}>Extension diagnostics</h3>
          <ul className={`${TYPE.small} mt-2 list-disc pl-4`}>
            {latestDiagnostics.map((event) => (
              <li key={event.id}>{event.evidence[0] ?? eventSummary(event)} <span className="text-muted-foreground">· {formatTime(event.observedAt)}</span></li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

function EventSection({
  events,
  title,
  blockedTrackerIds,
  onToggleBlocking
}: {
  events: DisplayObservation[]
  title: string
  blockedTrackerIds: string[]
  onToggleBlocking: (trackerId: string, blocked: boolean) => void
}) {
  if (events.length === 0) return null

  return (
    <section className="mt-4">
      <h2 className={TYPE.label}>{title}</h2>
      {events.map((event) => (
        <ObserverCard
          count={event.count}
          event={event.event}
          key={displayEventKey(event.event)}
          blockedTrackerIds={blockedTrackerIds}
          onToggleBlocking={onToggleBlocking}
        />
      ))}
    </section>
  )
}

function IndexPopup() {
  const [summary, setSummary] = useState<SiteSummary>(EMPTY_SUMMARY)
  const [settings, setSettings] = useState<UserSettings>(EMPTY_SETTINGS)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle")

  useEffect(() => {
    async function loadSummary() {
      const [currentWindowTab] = await browser.tabs.query({ active: true, currentWindow: true })
      const [lastFocusedTab] = currentWindowTab?.id ? [currentWindowTab] : await browser.tabs.query({ active: true, lastFocusedWindow: true })
      const tab = currentWindowTab?.id ? currentWindowTab : lastFocusedTab
      if (!tab?.id) {
        setLoadError("Chrome did not expose an active tab to this popup.")
        return
      }

      const response = await browser.runtime.sendMessage({
        type: "REFRESH_TAB_SCAN",
        tabId: tab.id
      })

      const parsedResponse = parseSiteSummaryResponse(response)
      if (parsedResponse.success) {
        setLoadError(null)
        setSummary(parsedResponse.data)
        return
      }

      setLoadError(`Background returned a malformed site summary: ${parsedResponse.error.issues.map((issue) => issue.path.join(".") || issue.message).join(", ")}`)
    }

    async function loadSettings() {
      const response = await browser.runtime.sendMessage({ type: "GET_SETTINGS" })
      const parsed = RuntimeMessageSchema.safeParse(response)
      if (parsed.success && parsed.data.type === "SETTINGS") setSettings(parsed.data.payload)
    }

    loadSummary().catch((error: unknown) => {
      setLoadError(error instanceof Error ? error.message : String(error))
      setSummary(EMPTY_SUMMARY)
    })
    loadSettings().catch(() => undefined)
  }, [])

  async function toggleTrackerBlocking(trackerId: string, blocked: boolean) {
    const blockedTrackerIds = blocked
      ? [...new Set([...settings.blockedTrackerIds, trackerId])]
      : settings.blockedTrackerIds.filter((id) => id !== trackerId)

    setSettings((current) => ({ ...current, blockedTrackerIds }))
    await browser.runtime.sendMessage({ type: "UPDATE_SETTINGS", payload: { blockedTrackerIds } }).catch(() => undefined)
  }

  async function copyOutput() {
    try {
      await navigator.clipboard.writeText(buildCopyPayload(summary))
      setCopyState("copied")
      setTimeout(() => setCopyState("idle"), 1600)
    } catch {
      setCopyState("failed")
      setTimeout(() => setCopyState("idle"), 2200)
    }
  }

  const displayEvents = compactEvents(summary.events)
  const recentEvents = displayEvents.slice(0, 12)
  const blockedEvents = recentEvents.filter(({ event }) => event.status === "blocked")
  const exposedEvents = recentEvents.filter(({ event }) => event.status === "active" || event.status === "mitigated")
  const cannotBlockEvents = recentEvents.filter(({ event }) => event.status === "cannot_block")

  return (
    <main className="max-h-[620px] min-w-[460px] overflow-y-auto bg-background p-4 font-mono text-foreground">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className={TYPE.label}>Proof Extension</p>
          <h1 className="mt-1 text-lg">Pulse Observer</h1>
        </div>
        <Button onClick={() => copyOutput().catch(() => setCopyState("failed"))}>
          {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy output"}
        </Button>
      </header>

      {summary.pageErrors.length > 0 ? (
        <section className="mt-3.5 border border-danger bg-card p-3" role="alert">
          <h2 className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-danger">
            Page error while this extension was active
          </h2>
          <p className={`${TYPE.small} mt-1`}>
            This tab threw {summary.pageErrors.length === 1 ? "an uncaught error" : `${summary.pageErrors.length} uncaught errors`}{" "}
            while Pulse Observer was running. This may or may not be caused by the extension — correlation, not proof.
          </p>
          <ul className={`${TYPE.small} mt-2 list-disc pl-4`}>
            {summary.pageErrors.map((pageError) => (
              <li key={pageError.id}>
                {pageError.message} <span className="text-muted-foreground">· {formatTime(pageError.observedAt)}</span>
                {pageError.stackPreview ? <pre className="mt-1 whitespace-pre-wrap break-words text-[0.625rem] text-muted-foreground">{pageError.stackPreview}</pre> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {loadError ? (
        <section className="mt-3.5 border border-danger bg-card p-3" role="alert">
          <h2 className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-danger">Observer connection failed</h2>
          <p className={`${TYPE.small} mt-1 break-words`}>{loadError}</p>
        </section>
      ) : null}

      <section className="mt-3.5 border border-border bg-card p-3">
        <h2 className={TYPE.label}>Watching now</h2>
        <p className={`${TYPE.body} mt-1 break-all`}>{summary.origin}</p>
      </section>

      <section aria-label="Observation summary" className="mt-2.5 grid grid-cols-5 gap-2">
        <Metric label="Types" value={displayEvents.length} />
        <Metric label="Raw" value={summary.events.length} />
        <Metric label="Active" value={summary.activeCompanies.length} />
        <Metric label="Blocked" value={summary.blockedCompanies.length} />
        <Metric label="Cannot" value={summary.cannotBlockSignals.length} />
      </section>

      <section className="mt-4">
        <h2 className={TYPE.label}>Recent observations</h2>
        <p className={`${TYPE.body} mt-1`}>
          {summary.events.length === 0
            ? "No observer events have been recorded for this tab yet."
            : `${displayEvents.length} observation types from ${summary.events.length} raw events.`}
        </p>
      </section>
      <EventSection events={blockedEvents} title="Blocked" blockedTrackerIds={settings.blockedTrackerIds} onToggleBlocking={toggleTrackerBlocking} />
      <EventSection events={exposedEvents} title="Still exposed" blockedTrackerIds={settings.blockedTrackerIds} onToggleBlocking={toggleTrackerBlocking} />
      <EventSection events={cannotBlockEvents} title="Cannot block" blockedTrackerIds={settings.blockedTrackerIds} onToggleBlocking={toggleTrackerBlocking} />
      {displayEvents.length > 0 ? (
        <section className="mt-4 border border-border bg-card p-3">
          <h2 className={TYPE.label}>What blocking changes</h2>
          <p className={`${TYPE.small} mt-2`}>
            Browser blocking can stop or reduce future browser-layer collection. It does not delete prior records, account-level data, server logs, IP visibility, or TLS fingerprints.
          </p>
        </section>
      ) : null}
      <DiagnosticsSection diagnostics={summary.events.filter(isDiagnosticEvent)} summary={summary} />
      {summary.incomplete ? (
        <p className={`${TYPE.small} mt-4`}>This tab summary is incomplete until background and content events arrive.</p>
      ) : null}
    </main>
  )
}

export default IndexPopup
