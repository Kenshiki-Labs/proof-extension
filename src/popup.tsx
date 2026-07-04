import "~style.css"

import { Fragment, useEffect, useState } from "react"
import { Activity, AlertTriangle, CircleDollarSign, ClipboardCopy, ExternalLink, Eye, EyeOff, FileText, Info, LineChart, Settings2, ShieldCheck, Trash2, TrendingUp, type LucideIcon } from "lucide-react"
import browser from "webextension-polyfill"

import { RuntimeMessageSchema } from "~core/contracts/schemas"
import { getObserverRemediation } from "~core/domain/remediation"
import {
  EMPTY_SUMMARY,
  blockabilitySummary,
  buildCopyPayload,
  compactEvents,
  compactPageErrors,
  detailEntries,
  diagnosticEvents,
  displayEventKey,
  eventSummary,
  formatDetailKey,
  formatTime,
  observerName,
  parseSiteSummaryResponse,
  titleCase,
  visibleSignals,
  type DisplayObservation
} from "~core/report/display"
import { blockingGuidance } from "~core/domain/blocking-policy"
import { summaryMetrics } from "~core/report/metrics"
import { formatUsd, getTrackerServes, formatUsdRange, getTrackerValuation, rollupObservedValuations } from "~core/domain/valuation"
import type { ObserverEvent, RollingValuationSummary, SiteSummary, UserSettings, ValuationPeriod } from "~core/domain/types"
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

const STATUS_LABELS: Record<ObserverEvent["status"], string> = {
  active: "Still exposed",
  blocked: "Blocked",
  mitigated: "Mitigated",
  cannot_block: "Cannot block"
}

// Muted, low-saturation status colors — cold and factual, not celebratory.
const STATUS_CLASSES: Record<ObserverEvent["status"], string> = {
  active: "border-amber-700/60 bg-amber-700/10 text-amber-700",
  blocked: "border-emerald-700/60 bg-emerald-700/10 text-emerald-700",
  mitigated: "border-sky-700/60 bg-sky-700/10 text-sky-700",
  cannot_block: "border-border bg-muted/40 text-muted-foreground"
}

// Section headings carry a small icon so the popup scans by shape and
// color, not by reading every label. Tones reuse the status palette:
// amber = still happening, emerald = stopped, muted = out of reach.
function SectionHeading({ icon: IconComponent, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <h2 className={`${TYPE.label} flex items-center gap-1.5`}>
      <IconComponent aria-hidden className="h-3 w-3 shrink-0" />
      {children}
    </h2>
  )
}

const SECTION_ICONS: Record<string, LucideIcon> = {
  Blocked: ShieldCheck,
  "Still exposed": Eye,
  "Cannot block": EyeOff
}

const METRIC_TONES = {
  amber: "text-amber-700",
  emerald: "text-emerald-700",
  muted: "text-muted-foreground",
  none: ""
} as const

function Metric({ label, value, title, tone = "none" }: { label: string; title?: string; value: number | string; tone?: keyof typeof METRIC_TONES }) {
  return (
    <div className="min-w-0 border border-border bg-card/80 p-3 shadow-sm" title={title}>
      <div className={TYPE.label}>{label}</div>
      <div className={`mt-1 font-display text-xl font-semibold tracking-tight ${METRIC_TONES[tone]}`}>{value}</div>
    </div>
  )
}

function HeaderIconButton({
  children,
  disabled,
  label,
  onClick
}: {
  children: React.ReactNode
  disabled?: boolean
  label: string
  onClick: () => void
}) {
  return (
    <span className="group relative inline-flex">
      <button
        aria-label={label}
        className="inline-flex min-h-9 min-w-9 items-center justify-center border border-border bg-card text-foreground shadow-sm transition-colors hover:border-foreground hover:bg-background focus:outline-none focus:ring-1 focus:ring-foreground disabled:cursor-not-allowed disabled:opacity-40"
        disabled={disabled}
        onClick={onClick}
        title={label}
        type="button">
        {children}
      </button>
      <span
        className="pointer-events-none absolute right-0 top-[calc(100%+6px)] z-20 whitespace-nowrap border border-border bg-background px-2 py-1 font-mono text-[0.625rem] uppercase tracking-[0.08em] text-foreground opacity-0 shadow-sm transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
        role="tooltip">
        {label}
      </span>
    </span>
  )
}

function CompactList({ emptyLabel, items }: { emptyLabel: string; items: string[] }) {
  if (items.length === 0) return <span className="text-muted-foreground">{emptyLabel}</span>
  return <span>{items.join(", ")}</span>
}

function ExplanationBullets({ items, limit }: { items: string[]; limit: number }) {
  return (
    <ul className={`${TYPE.small} mt-1.5 list-disc pl-4`}>
      {items.slice(0, limit).map((item) => <li key={item}>{item}</li>)}
    </ul>
  )
}

function ObserverCard({
  count,
  event,
  blockedTrackerIds,
  onToggleBlocking
}: DisplayObservation & { blockedTrackerIds: string[]; onToggleBlocking: (trackerId: string, blocked: boolean) => void }) {
  const remediation = getObserverRemediation(event)
  const guidance = blockingGuidance(event.trackerId)
  const canBlock = event.blockability === "network_blockable" && Boolean(event.trackerId) && guidance.offerBlocking
  const isBlocked = canBlock && blockedTrackerIds.includes(event.trackerId as string)
  const details = detailEntries(event)
  const valuation = getTrackerValuation(event.trackerId)

  return (
    <article className={`mt-2.5 ${UI.subtlePanel} p-3`}>
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
      {(() => {
        const serves = getTrackerServes(event.trackerId)
        return serves ? <p className={`${TYPE.small} mt-1.5`}>{serves.note}</p> : null
      })()}
      <p className={`${TYPE.body} mt-2`}>{eventSummary(event)}</p>
      {/* The two actions that matter most live at the top of the card, next
          to Block — not buried at the bottom of the remediation section. The
          cost of acting (time, ID check) is visible before the click. */}
      {remediation ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <a
            className="flex items-center gap-1 rounded-full border border-emerald-700/60 bg-emerald-700/10 px-2.5 py-1 text-[0.625rem] uppercase text-emerald-700 transition-colors hover:bg-emerald-700 hover:text-background"
            href={remediation.futureCollectionUrl}
            rel="noreferrer"
            target="_blank"
            title="Tell this company to stop collecting about you (opens their opt-out page)">
            <ExternalLink aria-hidden className="h-3 w-3" />
            Opt out
          </a>
          <a
            className="flex items-center gap-1 rounded-full border border-danger/60 bg-danger/10 px-2.5 py-1 text-[0.625rem] uppercase text-danger transition-colors hover:bg-danger hover:text-background"
            href={remediation.deletionUrl}
            rel="noreferrer"
            target="_blank"
            title="Ask this company to delete what it already holds (opens their deletion page)">
            <Trash2 aria-hidden className="h-3 w-3" />
            Delete my data
          </a>
          <span className={TYPE.small}>
            ≈{remediation.estimatedTimeMinutes} min · {remediation.identityVerificationRequired ? "ID check required" : "no ID check"}
          </span>
        </div>
      ) : null}
      {event.blockability === "network_blockable" && event.trackerId && !guidance.offerBlocking ? (
        <p className={`${TYPE.small} mt-1.5 text-muted-foreground`}>{"reason" in guidance ? guidance.reason : null}</p>
      ) : null}
      {canBlock && guidance.offerBlocking && guidance.warning ? (
        <p className={`${TYPE.small} mt-1.5 text-muted-foreground`}>Blocking caution: {guidance.warning}</p>
      ) : null}
      {count > 1 ? <p className={`${TYPE.small} mt-1`}>Observed {count} times in this tab. Showing the latest instance.</p> : null}
      {/* One meta line + one capability line. The full field dump lives
          behind "Details and evidence" — receipts on demand, not a wall. */}
      <p className={`${TYPE.small} mt-2`}>
        {formatTime(event.observedAt)} · {event.firstParty ? "First party" : "Third party"} · {titleCase(event.confidence)} confidence
      </p>
      <p className={`${TYPE.body} mt-1`}>{blockabilitySummary(event)}</p>
      <details className="mt-2">
        <summary className={`${TYPE.small} cursor-pointer select-none text-muted-foreground`}>Details and evidence</summary>
        <dl className="mt-2 grid grid-cols-[96px_1fr] gap-1.5">
          <dt className={TYPE.small}>Origin</dt>
          <dd className={`${TYPE.body} break-all`}>{event.origin}</dd>
          <dt className={TYPE.small}>Evidence type</dt>
          <dd className={TYPE.body}>{titleCase(event.eventType)}</dd>
          <dt className={TYPE.small}>Source</dt>
          <dd className={TYPE.body}>{titleCase(event.source)}</dd>
          <dt className={TYPE.small}>Class</dt>
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
      </details>
      {remediation ? (
        <section className="mt-3 border-t border-border pt-3">
          <h3 className={TYPE.label}>Stop at source</h3>
          <p className={`${TYPE.body} mt-2`}>{remediation.explanation.plainSummary}</p>
          <dl className="mt-2 grid grid-cols-[104px_1fr] gap-1.5">
            <dt className={TYPE.small}>Collects</dt>
            <dd className={TYPE.body}>{remediation.collects.join(", ")}</dd>
            <dt className={TYPE.small}>Used for</dt>
            <dd className={TYPE.body}>{remediation.monetization.join(", ")}</dd>
            <dt className={TYPE.small}>Risk</dt>
            <dd className={TYPE.body}>{titleCase(remediation.explanation.riskLevel)} · {remediation.explanation.riskReasons.join(", ")}</dd>
            {valuation ? (
              <>
                <dt className={TYPE.small}>Value</dt>
                <dd className={TYPE.body}>
                  {formatUsdRange(valuation.annual.low_usd, valuation.annual.high_usd)}/yr {valuation.valueType === "revenue" ? "revenue estimate" : "site cost estimate"}
                </dd>
              </>
            ) : null}
          </dl>
          <details className="mt-2.5">
            <summary className={`${TYPE.small} cursor-pointer select-none text-muted-foreground`}>Why it matters, and what blocking changes</summary>
            <div className="mt-2 grid gap-3">
              <div>
                <h4 className={TYPE.label}>Why it matters</h4>
                <ExplanationBullets items={remediation.explanation.whyItMatters} limit={2} />
              </div>
              <div>
                <h4 className={TYPE.label}>Blocking changes</h4>
                <ExplanationBullets items={remediation.explanation.whatBlockingChanges} limit={2} />
              </div>
              <div>
                <h4 className={TYPE.label}>Blocking does not change</h4>
                <ExplanationBullets items={remediation.explanation.whatBlockingDoesNotChange} limit={2} />
              </div>
              <p className={TYPE.small}>{remediation.notes}</p>
            </div>
          </details>
          <p className={`${TYPE.small} mt-2`}>Blocking does not delete records these companies already hold — use the buttons above for that.</p>
        </section>
      ) : null}
    </article>
  )
}

// Compact per-tab value rollup (docs/TRACKER_VALUE_SPEC.md). The popup shows
// estimates only; the full per-tracker table with sources lives in the report
// tab. Revenue and site-paid tooling are never summed into one number.
const VALUE_LEDGER_EXPLAINER =
  "This is a supply-chain estimate, not a payout. Advertiser money enters through ad rails; site-paid fees enter through publisher tools; identity and measurement data can feed future auctions. You are observed, not paid."

function ValueSection({ events }: { events: ObserverEvent[] }) {
  const rollup = rollupObservedValuations(events)
  if (rollup.perTracker.length === 0) return null

  return (
    <section className="mt-4">
      <SectionHeading icon={CircleDollarSign}>Estimated data value</SectionHeading>
      <div className={`mt-2.5 ${UI.subtlePanel} p-3`}>
        <p className={`${TYPE.body} mb-2`}>{VALUE_LEDGER_EXPLAINER}</p>
        <dl className="grid grid-cols-[128px_1fr] gap-1.5">
          <dt className={TYPE.small}>This visit</dt>
          <dd className={TYPE.body}>{formatUsd(rollup.thisVisitUsd)} across {rollup.perTracker.length} observed {rollup.perTracker.length === 1 ? "tracker" : "trackers"}</dd>
          {rollup.revenueTrackerCount > 0 ? (
            <>
              <dt className={TYPE.small}>Ad-market value to trackers/yr</dt>
              <dd className={TYPE.body}>
                {formatUsdRange(rollup.annualRevenueLowUsd, rollup.annualRevenueHighUsd)} across {rollup.revenueTrackerCount} revenue-model {rollup.revenueTrackerCount === 1 ? "tracker" : "trackers"}
              </dd>
            </>
          ) : null}
          {rollup.servesCounts.only_their_business > 0 ? (
            <>
              <dt className={TYPE.small}>No trade</dt>
              <dd className={TYPE.body}>
                {rollup.servesCounts.only_their_business} of these serve only their own business — {formatUsdRange(rollup.onlyTheirBusinessAnnualLowUsd, rollup.onlyTheirBusinessAnnualHighUsd)}/yr with nothing flowing back to you
              </dd>
            </>
          ) : null}
          {rollup.costTrackerCount > 0 ? (
            <>
              <dt className={TYPE.small}>Site-paid tool fees/yr</dt>
              <dd className={TYPE.body}>
                {formatUsdRange(rollup.annualOperatorCostLowUsd, rollup.annualOperatorCostHighUsd)} for {rollup.costTrackerCount} tracking {rollup.costTrackerCount === 1 ? "tool" : "tools"}
              </dd>
            </>
          ) : null}
        </dl>
        <p className={`${TYPE.small} mt-2`}>Estimates, not measurements. Details and sources in the full report.</p>
      </div>
    </section>
  )
}

const ROLLING_PERIODS: Array<{ label: string; value: ValuationPeriod }> = [
  { label: "Today", value: "day" },
  { label: "7 days", value: "week" },
  { label: "30 days", value: "month" }
]

function RollingValueSection({
  onPeriodChange,
  period,
  rollup
}: {
  onPeriodChange: (period: ValuationPeriod) => void
  period: ValuationPeriod
  rollup: RollingValuationSummary | null
}) {
  if (!rollup || rollup.trackerCount === 0) return null

  return (
    <section className="mt-4">
      <div className="flex items-center justify-between gap-2">
        <SectionHeading icon={TrendingUp}>Local value ledger</SectionHeading>
        <div className="flex gap-1">
          {ROLLING_PERIODS.map((item) => (
            <button
              className={`border px-2 py-1 text-[0.625rem] uppercase ${period === item.value ? "border-foreground text-foreground" : "border-border text-muted-foreground"}`}
              key={item.value}
              onClick={() => onPeriodChange(item.value)}
              type="button">
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className={`mt-2.5 ${UI.subtlePanel} p-3`}>
        <p className={`${TYPE.body} mb-2`}>{VALUE_LEDGER_EXPLAINER}</p>
        <dl className="grid grid-cols-[128px_1fr] gap-1.5">
          <dt className={TYPE.small}>Sites</dt>
          <dd className={TYPE.body}>{rollup.siteCount}</dd>
          <dt className={TYPE.small}>Visits</dt>
          <dd className={TYPE.body}>{rollup.visitCount}</dd>
          <dt className={TYPE.small}>Trackers</dt>
          <dd className={TYPE.body}>{rollup.trackerCount}</dd>
          <dt className={TYPE.small}>This period</dt>
          <dd className={TYPE.body}>{formatUsd(rollup.thisPeriodVisitUsd)} observed presence estimate</dd>
          {rollup.revenueTrackerCount > 0 ? (
            <>
              <dt className={TYPE.small}>Ad-market value to trackers/yr</dt>
              <dd className={TYPE.body}>{formatUsdRange(rollup.annualRevenueLowUsd, rollup.annualRevenueHighUsd)}</dd>
            </>
          ) : null}
          {rollup.costTrackerCount > 0 ? (
            <>
              <dt className={TYPE.small}>Site-paid tool fees/yr</dt>
              <dd className={TYPE.body}>{formatUsdRange(rollup.annualOperatorCostLowUsd, rollup.annualOperatorCostHighUsd)}</dd>
            </>
          ) : null}
        </dl>
      </div>
    </section>
  )
}

function DiagnosticsSection({ diagnostics, summary }: { diagnostics: ObserverEvent[]; summary: SiteSummary }) {
  const metrics = summaryMetrics(summary)
  const latestDiagnostics = diagnostics.slice(-4).reverse()

  return (
    <section className={`mt-4 ${UI.panel} ${UI.inset}`}>
      <SectionHeading icon={Settings2}>Runtime details</SectionHeading>
      <dl className="mt-2 grid grid-cols-[112px_1fr] gap-1.5">
        <dt className={TYPE.small}>Tab</dt>
        <dd className={TYPE.body}>{summary.tabId}</dd>
        <dt className={TYPE.small}>Updated</dt>
        <dd className={TYPE.body}>{formatTime(summary.updatedAt)}</dd>
        <dt className={TYPE.small}>Raw events</dt>
        <dd className={TYPE.body}>{metrics.storedEvents}</dd>
        <dt className={TYPE.small}>Evidence</dt>
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
      <SectionHeading icon={SECTION_ICONS[title] ?? Activity}>{title}</SectionHeading>
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
  const [showReportConfirm, setShowReportConfirm] = useState(false)
  const [valuationPeriod, setValuationPeriod] = useState<ValuationPeriod>("day")
  const [valuationRollup, setValuationRollup] = useState<RollingValuationSummary | null>(null)

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

  useEffect(() => {
    async function loadValuationRollup() {
      const response = await browser.runtime.sendMessage({ type: "GET_VALUATION_ROLLUP", period: valuationPeriod })
      const parsed = RuntimeMessageSchema.safeParse(response)
      if (parsed.success && parsed.data.type === "VALUATION_ROLLUP") setValuationRollup(parsed.data.payload)
    }

    loadValuationRollup().catch(() => setValuationRollup(null))
  }, [valuationPeriod])

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

  async function openFullReport() {
    if (summary.tabId < 0) return
    await browser.tabs.create({ url: browser.runtime.getURL(`tabs/report.html?tabId=${summary.tabId}&view=evidence`) })
  }

  async function openValueLedger() {
    const query = summary.tabId >= 0 ? `?tabId=${summary.tabId}&view=value` : "?view=value"
    await browser.tabs.create({ url: browser.runtime.getURL(`tabs/report.html${query}`) })
  }

  async function requestFullReport() {
    if (settings.skipReportOpenConfirm) {
      await openFullReport()
      return
    }

    setShowReportConfirm(true)
  }

  async function openFullReportAndRemember() {
    setSettings((current) => ({ ...current, skipReportOpenConfirm: true }))
    await browser.runtime.sendMessage({ type: "UPDATE_SETTINGS", payload: { skipReportOpenConfirm: true } }).catch(() => undefined)
    await openFullReport()
  }

  const metrics = summaryMetrics(summary)

  const displayEvents = compactEvents(summary.events)
  const pageErrors = compactPageErrors(summary.pageErrors)
  // Cap per section, not before the split — otherwise a burst of exposed
  // events pushes older blocked observations out of the Blocked section.
  const blockedEvents = displayEvents.filter(({ event }) => event.status === "blocked").slice(0, 12)
  const exposedEvents = displayEvents.filter(({ event }) => event.status === "active" || event.status === "mitigated").slice(0, 12)
  const cannotBlockEvents = displayEvents.filter(({ event }) => event.status === "cannot_block").slice(0, 12)
  const remediableObservers = [
    ...new Map(
      displayEvents
        .map(({ event }) => ({ event, remediation: getObserverRemediation(event) }))
        .filter((item) => item.remediation)
        .map((item) => [item.remediation!.observerName, item])
    ).values()
  ]

  return (
    <main className="max-h-[640px] min-w-[480px] overflow-y-auto bg-background p-4 font-body text-foreground">
      <header className={`${UI.panel} ${UI.inset} flex items-start justify-between gap-3`}>
        <SiteLogo textClass="text-base" sublabel="Pulse Observer" />
        <div className="flex flex-wrap justify-end gap-2">
          <HeaderIconButton disabled={summary.tabId < 0} label="Open full report" onClick={() => requestFullReport().catch(() => undefined)}>
            <FileText aria-hidden="true" size={16} strokeWidth={1.8} />
          </HeaderIconButton>
          <HeaderIconButton label="Open value ledger" onClick={() => openValueLedger().catch(() => undefined)}>
            <LineChart aria-hidden="true" size={16} strokeWidth={1.8} />
          </HeaderIconButton>
          <HeaderIconButton
            label={copyState === "copied" ? "Copied output" : copyState === "failed" ? "Copy failed" : "Copy output"}
            onClick={() => copyOutput().catch(() => setCopyState("failed"))}>
            <ClipboardCopy aria-hidden="true" size={16} strokeWidth={1.8} />
          </HeaderIconButton>
        </div>
      </header>

      {showReportConfirm ? (
        <section className={`mt-3.5 ${UI.panel} ${UI.inset}`}>
          <h2 className={TYPE.label}>Open full report in a new tab?</h2>
          <p className={`${TYPE.small} mt-2`}>
            The report opens an extension tab with detailed evidence, atomic evidence capability, source remediation, and diagnostics for this page.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => openFullReport().catch(() => undefined)}>Open report</Button>
            <Button onClick={() => openFullReportAndRemember().catch(() => undefined)} variant="secondary">Open and don't ask again</Button>
            <Button onClick={() => setShowReportConfirm(false)} variant="secondary">Not now</Button>
          </div>
        </section>
      ) : null}

      {/* Errors on a tab where the extension took no action (nothing blocked
          or mitigated) are the site's own bugs — reporting them here implied
          involvement we did not have and read as noise. Full detail stays in
          the report tab diagnostics for anyone investigating. */}
      {pageErrors.length > 0 && (metrics.blockedCompanies > 0 || metrics.mitigatedCompanies > 0) ? (
        <section className="mt-3.5 border border-danger bg-card p-3 shadow-sm" role="alert">
          <h2 className="flex items-center gap-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-danger"><AlertTriangle aria-hidden className="h-3 w-3 shrink-0" />Page error while this extension was active
          </h2>
          <p className={`${TYPE.small} mt-1`}>
            This tab threw {summary.pageErrors.length === 1 ? "an uncaught error" : `${summary.pageErrors.length} uncaught errors`}{" "}
            while Pulse Observer was running. This may or may not be caused by the extension — correlation, not proof.
          </p>
          <ul className={`${TYPE.small} mt-2 list-disc pl-4`}>
            {pageErrors.map(({ pageError, count }) => (
              <li key={pageError.id}>
                {pageError.message} {count > 1 ? <span className="text-muted-foreground">× {count}</span> : null}{" "}
                <span className="text-muted-foreground">· {formatTime(pageError.observedAt)}</span>
                {pageError.stackPreview ? <pre className="mt-1 whitespace-pre-wrap break-words text-[0.625rem] text-muted-foreground">{pageError.stackPreview}</pre> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {loadError ? (
        <section className="mt-3.5 border border-danger bg-card p-3 shadow-sm" role="alert">
          <h2 className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-danger">Observer connection failed</h2>
          <p className={`${TYPE.small} mt-1 break-words`}>{loadError}</p>
        </section>
      ) : null}

      <section className={`mt-3.5 ${UI.panel} ${UI.inset}`}>
        <SectionHeading icon={Eye}>Watching now</SectionHeading>
        <p className={`${TYPE.body} mt-1 break-all`}>{summary.origin}</p>
      </section>

      {/* Three company-oriented numbers. Signal/event counts are detail, not
          headline — they live in the Recent observations line and the report. */}
      <section aria-label="Observation summary" className="mt-2.5 grid grid-cols-3 gap-2">
        <Metric label="Watching" tone="amber" title="Companies whose collection on this tab is still happening" value={metrics.watchingCompanies} />
        <Metric label="Blocked" tone="emerald" title="Companies actually blocked by a rule you enabled — nothing blocks by default" value={metrics.blockedCompanies} />
        <Metric label="Can't block" tone="muted" title="Things no browser tool can block at all" value={metrics.cannotBlockSignals} />
      </section>

      <details className="mt-1.5">
        <summary className={`${TYPE.small} cursor-pointer select-none text-muted-foreground`}>What do these numbers mean?</summary>
        <dl className={`mt-2 ${UI.subtlePanel} grid grid-cols-[92px_1fr] gap-1.5 p-3`}>
          <dt className={TYPE.small}>Watching</dt>
          <dd className={TYPE.small}>Companies whose collection is still happening — observed, not blocked, not limited.</dd>
          <dt className={TYPE.small}>Blocked</dt>
          <dd className={TYPE.small}>Companies whose requests a rule actually stopped. Rules exist only where you clicked Block; nothing blocks by default.</dd>
          <dt className={TYPE.small}>Can't block</dt>
          <dd className={TYPE.small}>Things no browser tool can block: your internet address, how your connection looks, and anything a company records on its own servers.</dd>
        </dl>
      </details>

      <ValueSection events={summary.events} />
      <RollingValueSection onPeriodChange={setValuationPeriod} period={valuationPeriod} rollup={valuationRollup} />

      <section className="mt-4">
        <SectionHeading icon={Activity}>Recent observations</SectionHeading>
        <p className={`${TYPE.body} mt-1`}>
          {metrics.storedEvents === 0
            ? "No observer events have been recorded for this tab yet."
            : `${metrics.observations} observations from ${metrics.recordedEvents} recorded events.`}
        </p>
      </section>
      <EventSection events={blockedEvents} title="Blocked" blockedTrackerIds={settings.blockedTrackerIds} onToggleBlocking={toggleTrackerBlocking} />
      <EventSection events={exposedEvents} title="Still exposed" blockedTrackerIds={settings.blockedTrackerIds} onToggleBlocking={toggleTrackerBlocking} />
      <EventSection events={cannotBlockEvents} title="Cannot block" blockedTrackerIds={settings.blockedTrackerIds} onToggleBlocking={toggleTrackerBlocking} />

      {/* Non-blockable exposures are first-class evidence, not empty-state
          copy (spec) — these are true on every page load, so they render
          unconditionally rather than waiting for a cannot_block event. */}
      <section className="mt-4">
        <SectionHeading icon={EyeOff}>Cannot block</SectionHeading>
        <div className={`mt-2.5 ${UI.subtlePanel} p-3`}>
          <dl className="grid grid-cols-[128px_1fr] gap-1.5">
            <dt className={TYPE.small}>Your address</dt>
            <dd className={TYPE.body}>Every website you visit sees your internet address (IP). No extension can hide it.</dd>
            <dt className={TYPE.small}>Connection style</dt>
            <dd className={TYPE.body}>How your browser connects has a recognizable shape, visible before any page loads.</dd>
            <dt className={TYPE.small}>Their records</dt>
            <dd className={TYPE.body}>What a company writes down on its own servers about your visit is beyond any browser tool.</dd>
            <dt className={TYPE.small}>First contact</dt>
            <dd className={TYPE.body}>Some information travels in the very first message to a site, before this extension can act.</dd>
          </dl>
          <p className={`${TYPE.small} mt-2.5`}>
            This extension cannot prevent the destination server from seeing your IP address or request headers.
          </p>
        </div>
      </section>

      {remediableObservers.length > 0 ? (
        <section className="mt-4">
          <h2 className={TYPE.label}>Stop at source</h2>
          <div className={`mt-2.5 ${UI.subtlePanel} p-3`}>
            <ul className="space-y-2">
              {remediableObservers.map(({ remediation }) => (
                <li className="flex flex-wrap items-baseline justify-between gap-2" key={remediation!.observerName}>
                  <span className={TYPE.body}>{remediation!.observerName}</span>
                  <span className="flex gap-2">
                    <a className={`${TYPE.label} underline`} href={remediation!.futureCollectionUrl} rel="noreferrer" target="_blank">Opt out</a>
                    <a className={`${TYPE.label} underline`} href={remediation!.deletionUrl} rel="noreferrer" target="_blank">Request deletion</a>
                  </span>
                </li>
              ))}
            </ul>
            <p className={`${TYPE.small} mt-2.5`}>Details, friction, and identity requirements are on each observer card above.</p>
          </div>
        </section>
      ) : null}

      <section className="mt-4 border border-border bg-card p-3">
        <SectionHeading icon={Info}>What blocking changes</SectionHeading>
        <p className={`${TYPE.small} mt-2`}>
          Browser blocking can stop or reduce future browser-layer collection. It does not delete prior records, account-level data, server logs, IP visibility, or TLS fingerprints.
        </p>
      </section>
      <DiagnosticsSection diagnostics={diagnosticEvents(summary.events)} summary={summary} />
      {summary.incomplete ? (
        <p className={`${TYPE.small} mt-4`}>This tab summary is incomplete until background and content events arrive.</p>
      ) : null}
    </main>
  )
}

export default IndexPopup
