import "~style.css"

import { Fragment, useEffect, useState } from "react"
import browser from "webextension-polyfill"
import type { Storage } from "webextension-polyfill"

import { RuntimeMessageSchema } from "~core/contracts/schemas"
import { getObserverRemediation } from "~core/domain/remediation"
import ValueLedgerView from "~components/value/ValueLedgerView"
import { useValuationRollup } from "~hooks/useValuationRollup"
import type { AtomicSignalRow, DisplayObservation } from "~core/report/display"
import {
  EMPTY_SUMMARY,
  blockabilitySummary,
  buildAtomicSignalRows,
  buildCopyPayload,
  compactEvents,
  detailEntries,
  displayEventKey,
  eventSummary,
  exposureScanEvents,
  formatDetailKey,
  formatTime,
  localPageSignalObservations,
  observerName,
  parseSiteSummaryResponse,
  titleCase
} from "~core/report/display"
import { blockingGuidance } from "~core/domain/blocking-policy"
import { buildWatcherGroups } from "~core/report/watchers"
import { functionalCategoryBreakdown } from "~core/domain/functional-category"
import { rankObservers } from "~core/domain/attention"
import CleanupFlow from "~components/CleanupFlow"
import DebugView from "~components/debug/DebugView"
import Disclosure from "~components/system/Disclosure"
import TrackerGraph from "~components/value/TrackerGraph"
import VerdictBanner from "~components/VerdictBanner"
import WatcherList from "~components/watchers/WatcherList"
import { buildTabValuationEdges, buildUnclassifiedGraphEdges, formatUsd, formatUsdRange, getTrackerServes, MONETIZATION_FLOW_LABELS, rollupObservedValuations, SERVES_LABELS } from "~core/domain/valuation"
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

function Metric({ label, value }: { label: string; value: number | string }) {
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

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) return <p className={TYPE.body}>None stated.</p>
  return <ul className={`${TYPE.body} list-disc pl-5`}>{items.map((item) => <li key={item}>{item}</li>)}</ul>
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

type ReportView = "evidence" | "value" | "debug"

function initialReportView(): ReportView {
  const view = new URLSearchParams(location.search).get("view")
  return view === "value" || view === "debug" ? view : "evidence"
}

function ReportViewSwitch({ onViewChange, view }: { onViewChange: (view: ReportView) => void; view: ReportView }) {
  const options: Array<{ label: string; value: ReportView }> = [
    { label: "Evidence", value: "evidence" },
    { label: "Value ledger", value: "value" },
    { label: "Debug data", value: "debug" }
  ]

  return (
    <div className="flex flex-wrap gap-1" role="tablist">
      {options.map((option) => (
        <button
          aria-selected={view === option.value}
          className={`border px-3 py-1.5 font-mono text-xs uppercase tracking-[0.1em] ${view === option.value ? "border-foreground text-foreground" : "border-border text-muted-foreground"}`}
          key={option.value}
          onClick={() => onViewChange(option.value)}
          role="tab"
          type="button">
          {option.label}
        </button>
      ))}
    </div>
  )
}

function AtomicSignalMatrix({ rows }: { rows: AtomicSignalRow[] }) {
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
                <td className={`${TYPE.body} p-2 text-muted-foreground`} colSpan={6}>No page-observed evidence types yet.</td>
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
      <SectionTitle number="05" title="What could be read about you" />
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

function LocalPageSignalsSection({ observations }: { observations: DisplayObservation[] }) {
  return (
    <section className={`mt-6 ${UI.panel} ${UI.reportInset}`}>
      <SectionTitle number="05b" title="Local page processing" />
      <p className={`${TYPE.small} mt-2`}>
        First-party code can prepare privacy-choice plumbing or identifier hashes before a third-party request is visible. Values are not recorded.
      </p>
      <div className="mt-4 space-y-4">
        {observations.length === 0 ? <p className={TYPE.body}>No local page processing rows have been recorded for this tab yet.</p> : observations.map(({ event, count }) => (
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
              {event.evidence.map((evidence) => <li key={evidence}>{evidence}</li>)}
            </ul>
          </article>
        ))}
      </div>
    </section>
  )
}

// Estimated value model (docs/TRACKER_VALUE_SPEC.md). Revenue and operator
// cost are shown separately and every figure is labeled as an estimate — no
// false certainty, no single conflated number.
const ESTIMATED_VALUE_EXPLAINER =
  "This is a supply-chain estimate, not a payout. Advertiser money enters through ad rails; site-paid fees enter through publisher tools; identity and measurement data can feed future auctions. You are observed, not paid."

function ValuationSection({ embedded = false, events }: { embedded?: boolean; events: ObserverEvent[] }) {
  const rollup = rollupObservedValuations(events)
  if (rollup.perTracker.length === 0) return null

  return (
    <section className={embedded ? "mt-4" : `mt-6 ${UI.panel} ${UI.reportInset}`}>
      {embedded ? null : <SectionTitle number="03b" title="Estimated data value" />}
      <p className={`${TYPE.body} mt-2 max-w-4xl`}>{ESTIMATED_VALUE_EXPLAINER}</p>
      <p className={`${TYPE.small} mt-2`}>{rollup.disclaimer}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Metric
          label={`Ad-market value to trackers/yr (${rollup.revenueTrackerCount} ${rollup.revenueTrackerCount === 1 ? "tracker" : "trackers"})`}
          value={formatUsdRange(rollup.annualRevenueLowUsd, rollup.annualRevenueHighUsd)}
        />
        <Metric
          label={`Site-paid tool fees/yr (${rollup.costTrackerCount} ${rollup.costTrackerCount === 1 ? "tool" : "tools"})`}
          value={formatUsdRange(rollup.annualOperatorCostLowUsd, rollup.annualOperatorCostHighUsd)}
        />
        <Metric label="This visit" value={formatUsd(rollup.thisVisitUsd)} />
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left">
          <thead>
            <tr className={TYPE.small}>
              <th className="p-2">Tracker</th>
              <th className="p-2">Model</th>
              <th className="p-2">Who it serves</th>
              <th className="p-2">Annual estimate</th>
              <th className="p-2">This visit</th>
              <th className="p-2">Basis</th>
            </tr>
          </thead>
          <tbody>
            {rollup.perTracker.map(({ trackerId, value }) => (
              <tr className="border-t border-border align-top" key={trackerId}>
                <td className={`${TYPE.body} p-2`}>{trackerId}</td>
                <td className={`${TYPE.small} p-2`}>{MONETIZATION_FLOW_LABELS[value.monetizationFlow]}</td>
                <td className={`${TYPE.small} p-2`}>{(() => { const serves = getTrackerServes(trackerId); return serves ? SERVES_LABELS[serves.category] : "—" })()}</td>
                <td className={`${TYPE.body} p-2`}>
                  {value.valueType === "cost" && value.annual.high_usd === 0
                    ? "$0 (free tool)"
                    : formatUsdRange(value.annual.low_usd, value.annual.high_usd)}
                </td>
                <td className={`${TYPE.small} p-2`}>{formatUsd(value.perVisit.dollars)}</td>
                <td className={`${TYPE.small} p-2`}>{value.valueNote} ({value.confidence}: {value.sourceNote})</td>
              </tr>
            ))}
          </tbody>
        </table>
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
            <th className={`${TYPE.label} p-3`}>Evidence type</th>
            <th className={`${TYPE.label} p-3`}>Capability</th>
            <th className={`${TYPE.label} p-3`}>Count</th>
            <th className={`${TYPE.label} p-3`}>Latest</th>
            <th className={`${TYPE.label} p-3`}>Action</th>
          </tr>
        </thead>
        <tbody>
          {observations.map(({ event, count }) => {
            const remediation = getObserverRemediation(event)
            const guidance = blockingGuidance(event.trackerId)
            const canBlock = event.blockability === "network_blockable" && Boolean(event.trackerId) && guidance.offerBlocking
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

function EvidenceTimeline({ embedded = false, events }: { embedded?: boolean; events: ObserverEvent[] }) {
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

function RemediationPanel({ observations }: { observations: DisplayObservation[] }) {
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

function ReportTab() {
  const [summary, setSummary] = useState<SiteSummary>(EMPTY_SUMMARY)
  const [settings, setSettings] = useState<UserSettings>(EMPTY_SETTINGS)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle")
  const [reportView, setReportView] = useState<ReportView>(initialReportView)
  const { error: valuationError, period: valuationPeriod, refresh: refreshValuationRollup, rollup: valuationRollup, setPeriod: setValuationPeriod } = useValuationRollup("week")
  // "network" first: the graph is the picture users should see before the
  // supporting tables — see the report-tab story-arc discussion (verdict ->
  // picture -> receipts -> action).
  const [lens, setLens] = useState<"actors" | "money" | "network" | "timeline">("network")

  useEffect(() => {
    async function loadSummary() {
      const params = new URLSearchParams(location.search)
      const tabIdParam = Number(params.get("tabId"))
      const tabId = Number.isFinite(tabIdParam) && tabIdParam > 0 ? tabIdParam : undefined

      if (!tabId) {
        if (initialReportView() === "value") {
          setLoadError(null)
          return
        }
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

    // Background keeps observing and persisting after this tab's initial
    // fetch above — without this listener, an already-open report goes
    // stale the moment new page activity is recorded, since nothing else
    // ever re-fetches. storage.onChanged fires on every background write,
    // so this is the live-update path for the whole tab.
    function onStorageChanged(changes: Record<string, Storage.StorageChange>, area: string) {
      if (area !== "local") return
      if ("siteSummaries" in changes) loadSummary().catch(() => undefined)
      if ("userSettings" in changes) loadSettings().catch(() => undefined)
    }

    browser.storage.onChanged.addListener(onStorageChanged)
    return () => browser.storage.onChanged.removeListener(onStorageChanged)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    params.set("view", reportView)
    history.replaceState(null, "", `${location.pathname}?${params.toString()}`)
  }, [reportView])

  async function clearLedger() {
    await browser.runtime.sendMessage({ type: "CLEAR_VALUATION_LEDGER" })
    refreshValuationRollup()
  }

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

  const observations = rankObservers(summary.events).map(({ observation }) => observation)
  const allObservations = compactEvents(summary.events.filter((event) => event.source !== "extension-scan"))
    .sort((left, right) => right.count - left.count || right.event.observedAt - left.event.observedAt)
  const localPageSignals = localPageSignalObservations(summary.events)
  const rows = buildAtomicSignalRows(summary.events)
  const exposureEvents = exposureScanEvents(summary.events)
  const watcherGroups = buildWatcherGroups(summary.events, summary.origin)
  // Honestly scoped to THIS page, unlike valuationRollup.edges (the cross-site
  // rolling ledger used by the Value tab) — the promoted graph must show
  // what it claims to show.
  const tabEdges = buildTabValuationEdges(summary.events, summary.origin)
  // Unclassified parties get a node too — a named-only graph silently
  // contradicts the "Watching" headline, which counts them already.
  const unclassifiedTabEdges = buildUnclassifiedGraphEdges(summary.events, summary.origin)
  const categoryBreakdown = functionalCategoryBreakdown(summary.events)

  return (
    <main className="min-h-screen bg-background p-6 font-body text-foreground">
      <div className="mx-auto max-w-6xl">
        <header className={`${UI.panel} flex flex-wrap items-start justify-between gap-4 p-5`}>
          <div>
            <SiteLogo textClass="text-xl" sublabel="Pulse Observer report" />
            <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight">
              {reportView === "value" ? "Local value ledger" : reportView === "debug" ? "Debug data" : "Current tab evidence"}
            </h1>
            <p className={`${TYPE.body} mt-2 break-all`}>
              {reportView === "value"
                ? "Local estimates from tracker presence observed by this extension. Not revenue measurements."
                : reportView === "debug"
                  ? `Raw pipeline data for ${summary.origin} — fail-open, uncurated, for diagnosing what the product surfaces show.`
                  : summary.origin}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {reportView === "value" ? <Button onClick={() => clearLedger().catch(() => undefined)} variant="secondary">Clear ledger</Button> : null}
            <Button onClick={() => copyReport().catch(() => setCopyState("failed"))}>
              {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy report"}
            </Button>
          </div>
        </header>

        <section className={`mt-6 ${UI.panel} ${UI.reportInset}`}>
          <ReportViewSwitch onViewChange={setReportView} view={reportView} />
        </section>

        {loadError && reportView !== "value" ? (
          <section className="mt-6 border border-danger bg-card p-4" role="alert">
            <h2 className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-danger">Report load failed</h2>
            <p className={`${TYPE.body} mt-2 break-words`}>{loadError}</p>
          </section>
        ) : null}

        {valuationError && reportView === "value" ? (
          <section className="mt-6 border border-danger bg-card p-4" role="alert">
            <h2 className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-danger">Value ledger unavailable</h2>
            <p className={`${TYPE.body} mt-2 break-words`}>{valuationError}</p>
          </section>
        ) : null}

        {reportView === "value" && !valuationError ? (
          <div className="mt-6">
            <ValueLedgerView onPeriodChange={setValuationPeriod} period={valuationPeriod} rollup={valuationRollup} showMethodology />
          </div>
        ) : reportView === "evidence" ? (
          <>
            <VerdictBanner summary={summary} />

            <section className={`mt-6 ${UI.panel} ${UI.reportInset}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <SectionTitle number="01" title="Who was here — the picture" />
                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      { label: "Network", value: "network" },
                      { label: "Actors", value: "actors" },
                      { label: "Money", value: "money" },
                      { label: "Timeline", value: "timeline" }
                    ] as const
                  ).map((item) => (
                    <button
                      className={`${UI.segment} ${lens === item.value ? UI.segmentActive : UI.segmentIdle}`}
                      key={item.value}
                      onClick={() => setLens(item.value)}
                      type="button">
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              {categoryBreakdown.length > 0 ? (
                <ul className={`${TYPE.small} mt-3 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground`}>
                  {categoryBreakdown.map((entry) => (
                    <li key={entry.category}>
                      {entry.label} <span className="tabular-nums">{entry.count}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {lens === "network" ? (
                tabEdges.length > 0 || unclassifiedTabEdges.length > 0 ? (
                  <div className="mt-4">
                    <p className={`${TYPE.small}`}>
                      Every third party on this page, named or not — gray nodes are observed but not yet in our tracker database. Switch to "Who makes what" to size named ones by estimated annual value.
                    </p>
                    <div className={`mt-2 ${UI.subtlePanel} p-4`}>
                      <TrackerGraph edges={tabEdges} unclassifiedEdges={unclassifiedTabEdges} />
                    </div>
                  </div>
                ) : (
                  <p className={`${TYPE.body} mt-4`}>No third-party connections were observed on this page yet.</p>
                )
              ) : null}
              {lens === "actors" ? (
                <ObservationTable blockedTrackerIds={settings.blockedTrackerIds} observations={observations} onToggleBlocking={toggleTrackerBlocking} />
              ) : null}
              {lens === "money" ? <ValuationSection embedded events={summary.events} /> : null}
              {lens === "timeline" ? <EvidenceTimeline embedded events={summary.events} /> : null}
            </section>

            {/* Act 3 (docs/surface-contract.md): the full watcher list grouped
                by functional category, worst-first within groups, with every
                action inline — quick cleanup at the top, per-watcher opt-out
                and deletion detail behind the disclosure. */}
            <section className={`mt-6 ${UI.panel} ${UI.reportInset}`}>
              <SectionTitle number="02" title="Who is watching — and what you can do" />
              <div className="mt-3">
                <CleanupFlow events={summary.events} />
              </div>
              {watcherGroups.map((group) => (
                <div className="mt-4" key={group.category}>
                  <h3 className={TYPE.label}>
                    {group.label} <span className="tabular-nums">{group.rows.length}</span>
                  </h3>
                  <WatcherList
                    blockedTrackerIds={settings.blockedTrackerIds}
                    model={{ rows: group.rows, moreCount: 0, totalWatching: group.rows.length }}
                    onToggleBlocking={toggleTrackerBlocking}
                  />
                </div>
              ))}
              {watcherGroups.length === 0 ? <p className={`${TYPE.body} mt-3`}>No watchers on this page yet.</p> : null}
              <Disclosure className="mt-5" labelStyle="label" summary="Stop at source — opt-outs and deletion, per watcher">
                <RemediationPanel observations={observations} />
              </Disclosure>
            </section>

            <section className={`mt-6 ${UI.panel} ${UI.reportInset}`}>
              <SectionTitle number="03" title="The money" />
              <ValuationSection embedded events={summary.events} />
              <div className="mt-4">
                <Button onClick={() => setReportView("value")} variant="secondary">Open the full value ledger</Button>
              </div>
            </section>

            <Disclosure className="mt-6" labelStyle="label" summary="Appendix — full evidence for auditors">
              <section className={`mt-4 ${UI.panel} ${UI.reportInset}`}>
                <SectionTitle number="04" title="All observed activity" />
                <p className={`${TYPE.small} mt-2`}>
                  Grouped rows from the page's full activity stream — named watchers, site tools, not-yet-classified hosts, and storage/cache surfaces.
                </p>
                <ObservationTable blockedTrackerIds={settings.blockedTrackerIds} observations={allObservations} onToggleBlocking={toggleTrackerBlocking} />
              </section>
              <LocalPageSignalsSection observations={localPageSignals} />
              <ExposureScanSection events={exposureEvents} />
              <AtomicSignalMatrix rows={rows} />
            </Disclosure>
          </>
        ) : reportView === "debug" ? (
          <DebugView settings={settings} summary={summary} />
        ) : null}
      </div>
    </main>
  )
}

export default ReportTab
