import "~style.css"

import { Fragment, useEffect, useRef, useState } from "react"
import { ClipboardCopy } from "lucide-react"
import browser from "webextension-polyfill"
import type { Storage } from "webextension-polyfill"

import { RuntimeMessageSchema } from "~core/contracts/schemas"
import { getObserverRemediation } from "~core/domain/remediation"
import BetaBreadthNotice from "~components/BetaBreadthNotice"
import ValueLedgerView from "~components/value/ValueLedgerView"
import { useValuationRollup } from "~hooks/useValuationRollup"
import type { AtomicSignalRow, DisplayObservation } from "~core/report/display"
import {
  EMPTY_SUMMARY,
  buildLocalStatePurposeRollup,
  buildLocalStateRollup,
  blockabilitySummary,
  buildCookieMetadataRollup,
  buildAtomicSignalRows,
  buildCopyPayload,
  compactEvents,
  detailEntries,
  displayEventKey,
  eventSummary,
  exposureScanEvents,
  formatCopyEvent,
  formatDetailKey,
  formatTime,
  localPageSignalObservations,
  observerName,
  parseSiteSummaryResponse,
  persistenceSurfaceObservations,
  titleCase
} from "~core/report/display"
import { blockingGuidance } from "~core/domain/blocking-policy"
import { buildWatcherGroups } from "~core/report/watchers"
import { functionalCategoryBreakdown } from "~core/domain/functional-category"
import { countIdentifiedObservers, countSiteToolObservers, countUnclassifiedParties, countWatchingObservers } from "~core/domain/observer-counts"
import { rankObservers } from "~core/domain/attention"
import CleanupFlow from "~components/CleanupFlow"
import ContractAuditView from "~components/contract/ContractAuditView"
import DebugView from "~components/debug/DebugView"
import LocationReveal from "~components/LocationReveal"
import { NarrowingReportSection } from "~components/NarrowingPanel"
import Disclosure from "~components/system/Disclosure"
import TrackerGraph from "~components/value/TrackerGraph"
import VerdictBanner from "~components/VerdictBanner"
import VisitFrequencyAsk from "~components/VisitFrequencyAsk"
import WatcherList from "~components/watchers/WatcherList"
import { buildTabValuationEdges, buildUnclassifiedGraphEdges, formatUsd, formatUsdRange, getTrackerServes, MONETIZATION_FLOW_LABELS, rollupObservedValuations, SERVES_LABELS } from "~core/domain/valuation"
import { buildNarrowingModel } from "~core/report/narrowing"
import { registrableDomain } from "~core/domain/party"
import type { VisitFrequency } from "~core/domain/visit-frequency"
import type { CookieMetadataScanResult, CookieValueInspectEntry, CookieValueInspectResult, ObserverEvent, SiteSummary } from "~core/domain/types"
import type { UserSettings } from "~core/domain/types"
import Button from "~components/system/Button"
import SiteLogo from "~components/system/SiteLogo"
import { TYPE, UI } from "~components/system/tokens"

function domainForOrigin(origin: string): string | null {
  try {
    return registrableDomain(new URL(origin).hostname) || null
  } catch {
    return null
  }
}

function reportTabId(): number | null {
  const tabId = Number(new URLSearchParams(location.search).get("tabId"))
  return Number.isFinite(tabId) && tabId > 0 ? tabId : null
}

const EMPTY_SETTINGS: UserSettings = {
  retentionDays: 14,
  maxEventsPerTab: 100,
  blockedTrackerIds: [],
  mitigateCanvas: false,
  mitigateAudio: false,
  mitigateWebgl: false,
  skipReportOpenConfirm: false,
  cookieMetadataEnabled: false,
  siteVisitFrequency: {}
}

const FOOTER_LINKS = [
  { label: "About", href: "https://kenshiki.ai/about" },
  { label: "Privacy", href: "https://kenshiki.ai/privacy" },
  { label: "TOS", href: "https://kenshiki.ai/terms" }
] as const

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className={`${UI.metricCard} min-w-0`}>
      <div className={TYPE.label}>{label}</div>
      <div className={UI.metricValue}>{value}</div>
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

type ReportView = "evidence" | "local-state" | "contract" | "value" | "debug" | "ai-audit"

function initialReportView(): ReportView {
  const view = new URLSearchParams(location.search).get("view")
  if (view === "persistence") return "local-state"
  return view === "value" || view === "debug" || view === "contract" || view === "local-state" || view === "ai-audit" ? view : "evidence"
}

function ReportViewSwitch({ onViewChange, view }: { onViewChange: (view: ReportView) => void; view: ReportView }) {
  const options: Array<{ label: string; value: ReportView }> = [
    { label: "Runtime audit", value: "evidence" },
    { label: "Local state", value: "local-state" },
    { label: "Contract", value: "contract" },
    { label: "Value ledger", value: "value" },
    { label: "Debug data", value: "debug" },
    { label: "AI audit", value: "ai-audit" }
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

type CookieMetadataUiStatus = CookieMetadataScanResult["status"] | "idle" | "scanning" | "error"
type CookieValueInspectUiStatus = CookieValueInspectResult["status"] | "idle" | "scanning" | "error"

function cookieMetadataStatusCopy(status: CookieMetadataUiStatus, count: number, enabled: boolean) {
  if (!enabled) return "Enable browser cookie metadata in the popup to add HttpOnly/SameSite/Secure cookie records to reports for pages you visit."
  if (status === "available") return count === 0 ? "Browser cookie metadata was available; no matching first-party cookies were found." : `Browser cookie metadata scanned ${count} first-party ${count === 1 ? "cookie record" : "cookie records"}.`
  if (status === "permission_required") return "Cookie metadata is enabled in Pulse, but Chrome has not granted the optional cookies permission. Re-enable the popup checkbox to grant it."
  if (status === "unsupported") return "This browser does not expose the optional cookie metadata API to the extension."
  if (status === "restricted_page") return "Cookie metadata can only be inspected on normal http or https pages."
  if (status === "no_tab") return "No source tab was available for this report."
  if (status === "scanning") return "Inspecting browser cookie metadata for this site."
  if (status === "error") return "Cookie metadata scan failed before evidence could be recorded."
  return "Ready to inspect browser cookie metadata for this page. Values are never requested or recorded."
}

function cookieValueInspectStatusCopy(status: CookieValueInspectUiStatus, count: number) {
  if (status === "available") return count === 0 ? "No current-site cookie values were returned." : `${count} current-site ${count === 1 ? "cookie value is" : "cookie values are"} loaded in this page only.`
  if (status === "permission_required") return "Chrome has not granted the optional cookies permission. Re-enable the popup checkbox to grant it."
  if (status === "unsupported") return "This browser does not expose the optional cookie API to the extension."
  if (status === "restricted_page") return "Cookie values can only be inspected on normal http or https pages."
  if (status === "no_tab") return "No source tab was available for this report."
  if (status === "scanning") return "Loading current-site cookie values into this report page only."
  if (status === "error") return "Cookie value inspection failed before values could be shown."
  return "Values are hidden unless you explicitly inspect this site, then reveal a row."
}

function cookieValueKey(cookie: CookieValueInspectEntry) {
  return [cookie.domain, cookie.path, cookie.name].join("|")
}

function localStateCopyPayload({
  browserCookieObservations,
  cookieRollup,
  localStateObservations,
  localStateRollup,
  origin,
  statusCopy,
  webStoragePurposeRollup
}: {
  browserCookieObservations: DisplayObservation[]
  cookieRollup: ReturnType<typeof buildCookieMetadataRollup>
  localStateObservations: DisplayObservation[]
  localStateRollup: ReturnType<typeof buildLocalStateRollup>
  origin: string
  statusCopy: string
  webStoragePurposeRollup: ReturnType<typeof buildLocalStatePurposeRollup>
}) {
  return JSON.stringify({
    generatedAt: new Date().toISOString(),
    origin,
    surface: "local-state",
    valuePolicy: "Metadata only. Explicitly revealed cookie values are not included in this copy payload.",
    status: statusCopy,
    localStateRollup,
    webStoragePurposeRollup,
    cookieRollup,
    localStateObservations: localStateObservations.map(({ event, count }) => formatCopyEvent(event, count)),
    browserCookieMetadataObservations: browserCookieObservations.map(({ event, count }) => formatCopyEvent(event, count))
  }, null, 2)
}

function CookieValueInspectPanel({ enabled, tabId }: { enabled: boolean; tabId: number | null }) {
  const [cookies, setCookies] = useState<CookieValueInspectEntry[]>([])
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(() => new Set())
  const [status, setStatus] = useState<CookieValueInspectUiStatus>("idle")

  async function inspectValues() {
    if (!enabled) return
    if (!tabId) {
      setStatus("no_tab")
      return
    }

    setStatus("scanning")
    const response = await browser.runtime.sendMessage({ type: "INSPECT_SITE_COOKIE_VALUES", tabId })
    const parsed = RuntimeMessageSchema.safeParse(response)
    if (!parsed.success || parsed.data.type !== "COOKIE_VALUE_INSPECT") {
      setStatus("error")
      setCookies([])
      setRevealedKeys(new Set())
      return
    }

    setCookies(parsed.data.payload.cookies)
    setRevealedKeys(new Set())
    setStatus(parsed.data.payload.status)
  }

  function hideValues() {
    setCookies([])
    setRevealedKeys(new Set())
    setStatus("idle")
  }

  function toggleReveal(key: string) {
    setRevealedKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <section className={`mt-4 ${UI.densePanel}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className={TYPE.label}>Inspect cookie values locally</h3>
          <p className={`${TYPE.small} mt-2`}>
            This loads current-site cookie values into this report page only. They are not recorded, copied, exported, added to debug data, or sent off-device. HttpOnly values are browser-only data page scripts cannot read.
          </p>
          <p className={`${TYPE.body} mt-2`}>{cookieValueInspectStatusCopy(status, cookies.length)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {cookies.length > 0 ? <Button onClick={hideValues} variant="secondary">Hide values</Button> : null}
          <Button disabled={!enabled || status === "scanning" || !tabId} onClick={() => inspectValues().catch(() => setStatus("error"))} variant="secondary">
            {status === "scanning" ? "Loading" : "Inspect values"}
          </Button>
        </div>
      </div>
      {cookies.length > 0 ? (
        <div className="mt-3 overflow-x-auto border border-border bg-card">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border bg-background/60">
                <th className={`${TYPE.label} p-2`}>Cookie</th>
                <th className={`${TYPE.label} p-2`}>Scope</th>
                <th className={`${TYPE.label} p-2`}>Attributes</th>
                <th className={`${TYPE.label} p-2`}>Value</th>
                <th className={`${TYPE.label} p-2`}>Action</th>
              </tr>
            </thead>
            <tbody>
              {cookies.map((cookie) => {
                const key = cookieValueKey(cookie)
                const revealed = revealedKeys.has(key)
                return (
                  <tr className="border-b border-border align-top last:border-b-0" key={key}>
                    <td className={`${TYPE.body} p-2 break-all`}>{cookie.name || "(unnamed)"}</td>
                    <td className={`${TYPE.small} p-2 break-all`}>{cookie.domain}{cookie.path}</td>
                    <td className={`${TYPE.small} p-2`}>{[cookie.httpOnly ? "HttpOnly" : "script-readable", cookie.secure ? "Secure" : "not Secure", cookie.session ? "session" : "durable", cookie.sameSite].join(" · ")}</td>
                    <td className={`${TYPE.small} max-w-md p-2 break-all font-mono`}>{revealed ? cookie.value : "••••••••"}</td>
                    <td className="p-2"><Button onClick={() => toggleReveal(key)} variant="secondary">{revealed ? "Hide" : "Reveal"}</Button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}

function LocalStateSection({
  enabled,
  localStateObservations,
  observations,
  onScanComplete,
  origin,
  tabId
}: {
  enabled: boolean
  localStateObservations: DisplayObservation[]
  observations: DisplayObservation[]
  onScanComplete: () => Promise<void>
  origin: string
  tabId: number | null
}) {
  const autoScanStarted = useRef(false)
  const [localStateCopyState, setLocalStateCopyState] = useState<"idle" | "copied" | "failed">("idle")
  const [scanCount, setScanCount] = useState(0)
  const [status, setStatus] = useState<CookieMetadataUiStatus>("idle")
  const cookieRollup = buildCookieMetadataRollup(observations)
  const localStateRollup = buildLocalStateRollup(localStateObservations)
  const webStoragePurposeRollup = buildLocalStatePurposeRollup(localStateObservations)
  const statusCopy = cookieMetadataStatusCopy(status, scanCount, enabled)

  async function scanCookies() {
    if (!enabled) return
    if (!tabId) {
      setStatus("no_tab")
      return
    }

    setStatus("scanning")
    const response = await browser.runtime.sendMessage({ type: "SCAN_SITE_COOKIES", tabId })
    const parsed = RuntimeMessageSchema.safeParse(response)
    if (!parsed.success || parsed.data.type !== "COOKIE_METADATA_SCAN") {
      setStatus("error")
      return
    }

    setScanCount(parsed.data.payload.events.length)
    setStatus(parsed.data.payload.status)
    if (parsed.data.payload.status === "available") await onScanComplete()
  }

  async function copyLocalState() {
    await navigator.clipboard.writeText(localStateCopyPayload({
      browserCookieObservations: observations,
      cookieRollup,
      localStateObservations,
      localStateRollup,
      origin,
      statusCopy,
      webStoragePurposeRollup
    }))
    setLocalStateCopyState("copied")
    setTimeout(() => setLocalStateCopyState("idle"), 2000)
  }

  useEffect(() => {
    if (!enabled || !tabId || autoScanStarted.current) return
    autoScanStarted.current = true
    scanCookies().catch(() => setStatus("error"))
  }, [enabled, tabId])

  return (
    <section className={`mt-6 ${UI.panel} ${UI.reportInset}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionTitle number="05" title="Local state" />
        <button
          aria-label="Copy Local State metadata"
          className={`${UI.segment} ${UI.segmentIdle} flex items-center gap-1.5`}
          onClick={() => copyLocalState().catch(() => setLocalStateCopyState("failed"))}
          type="button">
          <ClipboardCopy aria-hidden className="h-3 w-3" />
          {localStateCopyState === "copied" ? "Copied" : localStateCopyState === "failed" ? "Copy failed" : "Copy"}
        </button>
      </div>
      <p className={`${TYPE.small} mt-2`}>
        What this site left in your browser: cookies, storage, local databases, cache, and background workers. Default report rows are metadata only; values appear only if you explicitly inspect them below.
      </p>
      <section className={`mt-4 ${UI.densePanel}`}>
        <h3 className={TYPE.label}>What this site left behind</h3>
        <p className={`${TYPE.body} mt-2`}>{localStateRollup.headline}</p>
        <div className={`mt-3 ${UI.statStrip}`}>
          <Metric label="Local records" value={localStateRollup.totalRecords} />
          <Metric label="Readable by page scripts" value={localStateRollup.scriptReadableRecords} />
          <Metric label="Browser-only" value={localStateRollup.browserOnlyRecords} />
          <Metric label="Durable" value={localStateRollup.durableRecords} />
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Metric label="Session" value={localStateRollup.sessionRecords} />
          <Metric label="Background workers" value={localStateRollup.backgroundWorkers} />
        </div>
        {localStateRollup.families.length > 0 ? (
          <ul className={`${TYPE.small} mt-3 flex flex-wrap gap-x-4 gap-y-1`}>
            {localStateRollup.families.map((family) => <li key={family.label}>{family.label} <span className="tabular-nums">{family.count}</span></li>)}
          </ul>
        ) : null}
      </section>
      <section className={`mt-4 ${UI.densePanel}`}>
        <h3 className={TYPE.label}>Web Storage keys</h3>
        <p className={`${TYPE.body} mt-2`}>{webStoragePurposeRollup.headline}</p>
        <div className={`mt-3 ${UI.statStrip}`}>
          <Metric label="Web Storage actions" value={webStoragePurposeRollup.totalRecords} />
          <Metric label="localStorage actions" value={webStoragePurposeRollup.localStorageRecords} />
          <Metric label="sessionStorage actions" value={webStoragePurposeRollup.sessionStorageRecords} />
          <Metric label="Clear/delete actions" value={webStoragePurposeRollup.clearOperations + webStoragePurposeRollup.deleteOperations} />
        </div>
        {webStoragePurposeRollup.purposes.length > 0 ? (
          <div className="mt-3 overflow-x-auto border border-border bg-card">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border bg-background/60">
                  <th className={`${TYPE.label} p-2`}>Likely purpose</th>
                  <th className={`${TYPE.label} p-2`}>Writes</th>
                  <th className={`${TYPE.label} p-2`}>Key examples</th>
                </tr>
              </thead>
              <tbody>
                {webStoragePurposeRollup.purposes.map((purpose) => (
                  <tr className="border-b border-border align-top last:border-b-0" key={purpose.label}>
                    <td className={`${TYPE.body} p-2`}>{purpose.label}</td>
                    <td className={`${TYPE.body} p-2 tabular-nums`}>{purpose.count}</td>
                    <td className={`${TYPE.small} p-2 break-all`}>{purpose.keyExamples.length > 0 ? purpose.keyExamples.join(" · ") : "Keys were hidden or unavailable"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
      <div className={`mt-4 flex flex-wrap items-center justify-between gap-3 ${UI.subtlePanel} p-4`}>
        <div>
          <p className={TYPE.body}>{statusCopy}</p>
          <p className={`${TYPE.small} mt-1`}>{enabled ? "Global setting is on. This report scans the current page only." : "Global setting is off."}</p>
        </div>
        <Button disabled={!enabled || status === "scanning" || !tabId} onClick={() => scanCookies().catch(() => setStatus("error"))} variant="secondary">
          {status === "scanning" ? "Scanning" : "Scan current page"}
        </Button>
      </div>
      <div className={`mt-4 ${UI.statStrip}`}>
        <Metric label="Cookie names seen" value={cookieRollup.totalCookies} />
        <Metric label="Readable by page scripts" value={cookieRollup.javascriptReadableCookies} />
        <Metric label="HttpOnly browser-only" value={cookieRollup.httpOnlyCookies} />
        <Metric label="Not marked Secure" value={cookieRollup.insecureCookies} />
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <Metric label="Session cookies" value={cookieRollup.sessionCookies} />
        <Metric label="Persistent cookies" value={cookieRollup.persistentCookies} />
        <Metric label="SameSite mix" value={cookieRollup.sameSiteSummary} />
      </div>
      <section className={`mt-4 ${UI.densePanel}`}>
        <h3 className={TYPE.label}>What this tells you</h3>
        {localStateRollup.takeaways.length > 0 || webStoragePurposeRollup.takeaways.length > 0 || cookieRollup.takeaways.length > 0 ? (
          <ul className={`${TYPE.body} mt-3 list-disc pl-5`}>
            {[...localStateRollup.takeaways, ...webStoragePurposeRollup.takeaways, ...cookieRollup.takeaways].map((takeaway) => <li key={takeaway}>{takeaway}</li>)}
            <li>Cookie and storage values can name server-side records, carts, sessions, or preferences; the browser can show the local token, but not what the server attaches to it.</li>
          </ul>
        ) : (
          <p className={`${TYPE.body} mt-3`}>{enabled ? "No matching first-party browser cookie metadata has been recorded for this page yet." : "Enable the popup setting to inspect this page’s browser cookie metadata."}</p>
        )}
      </section>
      <CookieValueInspectPanel enabled={enabled} tabId={tabId} />
      <Disclosure className="mt-4" labelStyle="label" summary="Raw cookie metadata evidence">
        <ObservationTable blockedTrackerIds={[]} observations={observations} onToggleBlocking={() => undefined} />
      </Disclosure>
      <Disclosure className="mt-4" labelStyle="label" summary="Raw local-state evidence">
        <ObservationTable blockedTrackerIds={[]} observations={localStateObservations} onToggleBlocking={() => undefined} />
      </Disclosure>
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

function AuditBrief({
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
  if (exposureEvents.length > 0) takeaways.push("A browser-surface scan is available; it shows what scripts could read, not proof this page read every field.")
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
        <Metric label="Evidence rows" value={allObservations.length} />
        <Metric label="Local state rows" value={localStateObservations.length} />
        <Metric label="Browser-surface scans" value={exposureEvents.length} />
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <Metric label="Exposed signal types" value={exposedSignals.length} />
        <Metric label="Page errors" value={summary.pageErrors.length} />
      </div>
      <ul className={`${TYPE.body} mt-4 list-disc pl-5`}>
        {takeaways.map((takeaway) => <li key={takeaway}>{takeaway}</li>)}
      </ul>
    </section>
  )
}

function markdownInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>
    if (part.startsWith("`") && part.endsWith("`")) return <code className="border border-border bg-background px-1 py-0.5 font-mono text-[0.8125em]" key={`${part}-${index}`}>{part.slice(1, -1)}</code>
    return <Fragment key={`${part}-${index}`}>{part}</Fragment>
  })
}

function markdownCells(row: string) {
  return row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim())
}

function isMarkdownTableSeparator(line: string) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line)
}

function MarkdownTable({ lines, tableKey }: { lines: string[]; tableKey: string }) {
  const [header = [], , ...bodyRows] = lines.map(markdownCells)

  return (
    <div className="my-4 overflow-x-auto border border-border bg-card">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <thead>
          <tr className="border-b border-border bg-background/60">
            {header.map((cell, index) => <th className={`${TYPE.label} p-2`} key={`${tableKey}-head-${index}`}>{markdownInline(cell)}</th>)}
          </tr>
        </thead>
        <tbody>
          {bodyRows.map((row, rowIndex) => (
            <tr className="border-b border-border align-top last:border-b-0" key={`${tableKey}-row-${rowIndex}`}>
              {row.map((cell, cellIndex) => <td className={`${TYPE.body} p-2`} key={`${tableKey}-cell-${rowIndex}-${cellIndex}`}>{markdownInline(cell)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MarkdownReport({ content }: { content: string }) {
  const blocks = []
  const lines = content.split(/\r?\n/)
  let index = 0

  while (index < lines.length) {
    const line = lines[index] ?? ""
    const trimmed = line.trim()

    if (!trimmed) {
      index += 1
      continue
    }

    if (trimmed === "---") {
      blocks.push(<hr className="my-5 border-border" key={`hr-${index}`} />)
      index += 1
      continue
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(trimmed)
    if (heading) {
      const level = (heading[1] ?? "").length
      const text = markdownInline(heading[2] ?? "")
      if (level === 1) blocks.push(<h1 className="mt-5 font-display text-2xl font-semibold tracking-tight first:mt-0" key={`h-${index}`}>{text}</h1>)
      else if (level === 2) blocks.push(<h2 className="mt-6 font-display text-xl font-semibold tracking-tight" key={`h-${index}`}>{text}</h2>)
      else if (level === 3) blocks.push(<h3 className="mt-5 font-display text-base font-semibold tracking-tight" key={`h-${index}`}>{text}</h3>)
      else blocks.push(<h4 className={`${TYPE.label} mt-4`} key={`h-${index}`}>{text}</h4>)
      index += 1
      continue
    }

    if (trimmed.startsWith("|") && index + 1 < lines.length && isMarkdownTableSeparator(lines[index + 1] ?? "")) {
      const tableLines = [line, lines[index + 1] ?? ""]
      index += 2
      while (index < lines.length && (lines[index] ?? "").trim().startsWith("|")) {
        tableLines.push(lines[index] ?? "")
        index += 1
      }
      blocks.push(<MarkdownTable key={`table-${index}`} lines={tableLines} tableKey={`table-${index}`} />)
      continue
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = []
      while (index < lines.length && /^[-*]\s+/.test((lines[index] ?? "").trim())) {
        items.push((lines[index] ?? "").trim().replace(/^[-*]\s+/, ""))
        index += 1
      }
      blocks.push(<ul className={`${TYPE.body} mt-3 list-disc pl-5`} key={`ul-${index}`}>{items.map((item, itemIndex) => <li key={`${item}-${itemIndex}`}>{markdownInline(item)}</li>)}</ul>)
      continue
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = []
      while (index < lines.length && /^\d+\.\s+/.test((lines[index] ?? "").trim())) {
        items.push((lines[index] ?? "").trim().replace(/^\d+\.\s+/, ""))
        index += 1
      }
      blocks.push(<ol className={`${TYPE.body} mt-3 list-decimal pl-5`} key={`ol-${index}`}>{items.map((item, itemIndex) => <li key={`${item}-${itemIndex}`}>{markdownInline(item)}</li>)}</ol>)
      continue
    }

    const paragraph: string[] = []
    while (
      index < lines.length &&
      (lines[index] ?? "").trim() &&
      !/^(#{1,4})\s+/.test((lines[index] ?? "").trim()) &&
      !/^[-*]\s+/.test((lines[index] ?? "").trim()) &&
      !/^\d+\.\s+/.test((lines[index] ?? "").trim()) &&
      !((lines[index] ?? "").trim().startsWith("|") && index + 1 < lines.length && isMarkdownTableSeparator(lines[index + 1] ?? "")) &&
      (lines[index] ?? "").trim() !== "---"
    ) {
      paragraph.push((lines[index] ?? "").trim())
      index += 1
    }
    blocks.push(<p className={`${TYPE.body} mt-3`} key={`p-${index}`}>{markdownInline(paragraph.join(" "))}</p>)
  }

  return <div className="mt-3 max-w-none">{blocks}</div>
}

function safeReportSlug(origin: string) {
  try {
    return new URL(origin).hostname.replace(/[^a-z0-9.-]+/gi, "-").replace(/^-+|-+$/g, "") || "site"
  } catch {
    return "site"
  }
}

function govHostname(origin: string) {
  try {
    const hostname = new URL(origin).hostname.toLowerCase()
    return hostname.endsWith(".gov") ? hostname : null
  } catch {
    return null
  }
}

function AiAuditReportPanel({ summary, tabId }: { summary: SiteSummary; tabId: number | null }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle")
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState("")
  const [saveState, setSaveState] = useState<"idle" | "saved" | "failed">("idle")
  const [status, setStatus] = useState<"idle" | "running" | "ready" | "failed">("idle")
  const eligibleHostname = govHostname(summary.origin)
  const generationDisabled = status === "running" || !eligibleHostname || !tabId

  async function generateReport() {
    if (!eligibleHostname || !tabId) {
      setError(eligibleHostname ? "This report page is missing its tab context; reopen it from the popup." : "AI audit generation is enabled only for .gov domains.")
      setStatus("failed")
      return
    }

    setError(null)
    setStatus("running")
    try {
      const response = await browser.runtime.sendMessage({
        type: "GENERATE_AI_AUDIT_REPORT",
        payload: { tabId, auditPayload: buildCopyPayload(summary) }
      })
      const parsed = RuntimeMessageSchema.safeParse(response)
      if (!parsed.success) throw new Error("Background returned a malformed AI audit response.")
      if (parsed.data.type === "AI_AUDIT_REPORT_FAILED") throw new Error(parsed.data.error)
      if (parsed.data.type !== "AI_AUDIT_REPORT") throw new Error("Background did not return an AI audit report.")
      setReport(parsed.data.payload.report)
      setStatus("ready")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setStatus("failed")
    }
  }

  async function copyAiReport() {
    try {
      await navigator.clipboard.writeText(report)
      setCopyState("copied")
      setTimeout(() => setCopyState("idle"), 1600)
    } catch {
      setCopyState("failed")
      setTimeout(() => setCopyState("idle"), 2200)
    }
  }

  function saveAiReport() {
    try {
      const blob = new Blob([report], { type: "text/markdown;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `pulse-ai-audit-${safeReportSlug(summary.origin)}-${new Date().toISOString().slice(0, 10)}.md`
      link.click()
      URL.revokeObjectURL(url)
      setSaveState("saved")
      setTimeout(() => setSaveState("idle"), 1600)
    } catch {
      setSaveState("failed")
      setTimeout(() => setSaveState("idle"), 2200)
    }
  }

  return (
    <section className={`mt-6 ${UI.panel} ${UI.reportInset}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionTitle number="AI" title="Government trust opportunity" />
          <p className={`${TYPE.body} mt-2 max-w-4xl`}>
            Generate a concise report on whether this .gov service is missing opportunities to bind legitimate users to
            high-stakes actions without increasing surveillance.
          </p>
          <p className={`${TYPE.small} mt-2`}>
            {eligibleHostname ? `Ready for ${eligibleHostname}.` : `AI reports are available only for .gov domains.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={generationDisabled} onClick={() => generateReport().catch(() => undefined)}>
            {status === "running" ? "Generating" : report ? "Regenerate" : "Generate report"}
          </Button>
          {report ? (
            <>
              <Button onClick={() => copyAiReport().catch(() => setCopyState("failed"))} variant="secondary">
                {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy report"}
              </Button>
              <Button onClick={saveAiReport} variant="secondary">
                {saveState === "saved" ? "Saved" : saveState === "failed" ? "Save failed" : "Save report"}
              </Button>
            </>
          ) : null}
        </div>
      </div>
      {!report ? (
        <div className={`${UI.subtlePanel} mt-4 p-4`}>
          <h3 className={TYPE.label}>Report focus</h3>
          <ul className={`${TYPE.body} mt-3 list-disc pl-5`}>
            <li>Lead with the missed trust opportunity, not a tracker inventory.</li>
            <li>Use observed browser evidence to separate operational telemetry from citizen-benefiting assurance.</li>
            <li>Recommend first-party, consented, purpose-bound proof for sensitive actions.</li>
            <li>Reject adtech-style tracking, opaque profiling, and broader passive observation.</li>
          </ul>
        </div>
      ) : null}
      {error ? <p className={`${TYPE.small} mt-3 text-danger`}>{error}</p> : null}
      {report ? (
        <article className={`${UI.subtlePanel} mt-4 p-4`}>
          <div className="flex flex-wrap gap-2">
            <h3 className={TYPE.label}>Generated report</h3>
          </div>
          <MarkdownReport content={report} />
        </article>
      ) : null}
    </section>
  )
}

function ReportFooter() {
  return (
    <footer className={`${TYPE.small} mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border py-5`}>
      <span>Pulse Observer</span>
      <nav aria-label="Product links" className="flex flex-wrap items-center gap-4">
        {FOOTER_LINKS.map((link) => (
          <a className="underline hover:text-foreground" href={link.href} key={link.href} rel="noreferrer" target="_blank">
            {link.label}
          </a>
        ))}
      </nav>
    </footer>
  )
}

function ReportTab() {
  const [summary, setSummary] = useState<SiteSummary>(EMPTY_SUMMARY)
  const [settings, setSettings] = useState<UserSettings>(EMPTY_SETTINGS)
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const [loadError, setLoadError] = useState<string | null>(null)
  const [summaryLoaded, setSummaryLoaded] = useState(false)
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle")
  const [reportView, setReportView] = useState<ReportView>(initialReportView)
  const { error: valuationError, period: valuationPeriod, refresh: refreshValuationRollup, rollup: valuationRollup, setPeriod: setValuationPeriod } = useValuationRollup("week")
  // "network" first: the graph is the picture users should see before the
  // supporting tables — see the report-tab story-arc discussion (verdict ->
  // picture -> receipts -> action).
  const [lens, setLens] = useState<"actors" | "money" | "network" | "timeline">("network")

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
    setSummaryLoaded(true)
    setLoadError(null)
  }

  useEffect(() => {
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
    // Confirm-first, never optimistic: "Unblock" in the UI is a claim that a
    // DNR rule is installed, so the local state only flips after the
    // background acknowledges the write. Computed from the freshest settings
    // (settingsRef) so two quick toggles cannot erase each other.
    const blockedTrackerIds = blocked
      ? [...new Set([...settingsRef.current.blockedTrackerIds, trackerId])]
      : settingsRef.current.blockedTrackerIds.filter((id) => id !== trackerId)

    try {
      await browser.runtime.sendMessage({ type: "UPDATE_SETTINGS", payload: { blockedTrackerIds } })
      setSettings((current) => ({ ...current, blockedTrackerIds }))
    } catch (error) {
      console.warn("Failed to update blocking", error)
    }
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
  const browserCookieObservations = compactEvents(summary.events.filter((event) => event.eventType === "cookie_observed" && event.source === "extension-scan"))
  const localStateObservations = persistenceSurfaceObservations(summary.events)
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
  const narrowingModel = buildNarrowingModel(summary.events)
  const siteDomain = domainForOrigin(summary.origin)
  const observedRollup = rollupObservedValuations(summary.events)

  async function answerVisitFrequency(frequency: VisitFrequency) {
    if (!siteDomain) return
    const siteVisitFrequency = { ...settings.siteVisitFrequency, [siteDomain]: frequency }
    setSettings((current) => ({ ...current, siteVisitFrequency }))
    await browser.runtime.sendMessage({ type: "UPDATE_SETTINGS", payload: { siteVisitFrequency } }).catch(() => undefined)
  }

  return (
    <main className="min-h-screen bg-background p-6 font-body text-foreground">
      <div className="mx-auto max-w-6xl">
        <header className={`${UI.panel} flex flex-wrap items-start justify-between gap-4 p-5`}>
          <div>
            <SiteLogo textClass="text-xl" sublabel="Pulse Observer report" />
            <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight">
              {reportView === "value"
                ? "Local value ledger"
                : reportView === "ai-audit"
                  ? "AI audit narrative"
                : reportView === "debug"
                  ? "Debug data"
                  : reportView === "contract"
                    ? "Done vs. declared"
                    : "Runtime audit report"}
            </h1>
            <p className={`${TYPE.body} mt-2 break-all`}>
              {reportView === "value"
                ? "Local estimates from tracker presence observed by this extension. Not revenue measurements."
                : reportView === "ai-audit"
                  ? `Generated buyer-ready audit narrative for ${summary.origin}`
                : reportView === "debug"
                  ? `Raw pipeline data for ${summary.origin} — fail-open, uncurated, for diagnosing what the product surfaces show.`
                  : reportView === "contract"
                    ? `What this page did, reconciled against the legal documents it links to — ${summary.origin}`
                    : `Browser-local evidence for ${summary.origin}`}
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

        <BetaBreadthNotice />

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
        ) : reportView === "contract" ? (
          <ContractAuditView
            onShowEvidence={() => setReportView("evidence")}
            summary={summary}
            summaryFailed={loadError !== null}
            summaryReady={summaryLoaded}
            tabId={reportTabId()}
          />
        ) : reportView === "local-state" ? (
          <LocalStateSection
            enabled={settings.cookieMetadataEnabled}
            localStateObservations={localStateObservations}
            observations={browserCookieObservations}
            onScanComplete={loadSummary}
            origin={summary.origin}
            tabId={reportTabId()}
          />
        ) : reportView === "ai-audit" ? (
          <AiAuditReportPanel summary={summary} tabId={reportTabId()} />
        ) : reportView === "evidence" ? (
          <>
            <AuditBrief
              allObservations={allObservations}
              exposureEvents={exposureEvents}
              localStateObservations={localStateObservations}
              summary={summary}
            />
            <VerdictBanner summary={summary} />
            <VisitFrequencyAsk
              annualHighUsd={observedRollup.annualRevenueHighUsd}
              annualLowUsd={observedRollup.annualRevenueLowUsd}
              domain={siteDomain}
              frequency={siteDomain ? (settings.siteVisitFrequency[siteDomain] ?? null) : null}
              onAnswer={(frequency) => answerVisitFrequency(frequency).catch(() => undefined)}
              revenueTrackerCount={observedRollup.revenueTrackerCount}
            />
            {narrowingModel.steps.length > 0 ? (
              <div className="mt-6">
                <LocationReveal watching={narrowingModel.watching} />
              </div>
            ) : null}
            <NarrowingReportSection model={narrowingModel} />

            <section className={`mt-6 ${UI.panel} ${UI.reportInset}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <SectionTitle number="02" title="Who was here — the picture" />
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
              <SectionTitle number="03" title="Who is watching — and what you can do" />
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
              <SectionTitle number="04" title="The money" />
              <ValuationSection embedded events={summary.events} />
              <div className="mt-4">
                <Button onClick={() => setReportView("value")} variant="secondary">Open the full value ledger</Button>
              </div>
            </section>

            <Disclosure className="mt-6" labelStyle="label" summary="Appendix — full evidence for auditors">
              <section className={`mt-4 ${UI.panel} ${UI.reportInset}`}>
                <SectionTitle number="05" title="All observed activity" />
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

        <ReportFooter />
      </div>
    </main>
  )
}

export default ReportTab
