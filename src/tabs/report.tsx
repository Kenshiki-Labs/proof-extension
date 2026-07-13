import "~style.css"

import { useEffect, useRef, useState } from "react"
import browser from "webextension-polyfill"
import type { Storage } from "webextension-polyfill"

import { RuntimeMessageSchema } from "~core/contracts/messages"
import { DEFAULT_SETTINGS } from "~core/domain/default-settings"
import type { SiteSummary, UserSettings } from "~core/domain/types"
import type { VisitFrequency } from "~core/domain/visit-frequency"
import { EMPTY_SUMMARY, buildCopyPayload, parseSiteSummaryResponse } from "~core/report/display"
import { useReportModel } from "~hooks/useReportModel"
import { useTransientState } from "~hooks/useTransientState"
import { useValuationRollup } from "~hooks/useValuationRollup"
import BetaBreadthNotice from "~components/BetaBreadthNotice"
import ContractAuditView from "~components/contract/ContractAuditView"
import DebugView from "~components/debug/DebugView"
import EvidenceView from "~components/report/EvidenceView"
import LocalStateSection from "~components/report/LocalStateView"
import { ReportFooter, ReportViewSwitch, initialReportView, reportTabId, type ReportView } from "~components/report/shared"
import Button from "~components/system/Button"
import SiteLogo from "~components/system/SiteLogo"
import { TYPE, UI } from "~components/system/tokens"
import ValueLedgerView from "~components/value/ValueLedgerView"


function ReportTab() {
  const [summary, setSummary] = useState<SiteSummary>(EMPTY_SUMMARY)
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS)
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const [loadError, setLoadError] = useState<string | null>(null)
  const [summaryLoaded, setSummaryLoaded] = useState(false)
  const [copyState, flashCopyState] = useTransientState<"idle" | "copied" | "failed">("idle")
  const [clearState, flashClearState] = useTransientState<"idle" | "failed">("idle")
  const [reportView, setReportView] = useState<ReportView>(initialReportView)
  const { error: valuationError, period: valuationPeriod, refresh: refreshValuationRollup, rollup: valuationRollup, setPeriod: setValuationPeriod } = useValuationRollup("week")
  const model = useReportModel(summary)

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

  async function toggleTrackerShim(trackerId: string, shimmed: boolean) {
    // Same confirm-first discipline as blocking: "Mitigated" is a claim that
    // redirect rules are installed, so state flips only after the background
    // acknowledges the settings write.
    const shimmedTrackerIds = shimmed
      ? [...new Set([...settingsRef.current.shimmedTrackerIds, trackerId])]
      : settingsRef.current.shimmedTrackerIds.filter((id) => id !== trackerId)

    try {
      await browser.runtime.sendMessage({ type: "UPDATE_SETTINGS", payload: { shimmedTrackerIds } })
      setSettings((current) => ({ ...current, shimmedTrackerIds }))
    } catch (error) {
      console.warn("Failed to update mitigation", error)
    }
  }

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(buildCopyPayload(summary))
      flashCopyState("copied", 1600)
    } catch {
      flashCopyState("failed", 2200)
    }
  }

  async function answerVisitFrequency(frequency: VisitFrequency) {
    // Confirm-first, like the block/mitigate toggles: the calibrated money
    // line recalcs from this answer, so it must not display an answer the
    // background never stored.
    if (!model.siteDomain) return
    const siteVisitFrequency = { ...settingsRef.current.siteVisitFrequency, [model.siteDomain]: frequency }
    try {
      await browser.runtime.sendMessage({ type: "UPDATE_SETTINGS", payload: { siteVisitFrequency } })
      setSettings((current) => ({ ...current, siteVisitFrequency }))
    } catch (error) {
      console.warn("Failed to store visit frequency", error)
    }
  }

  // EMPTY_SUMMARY's origin is the literal string "unknown" — never show it
  // in the visible copy while the summary is still loading.
  const originLabel = summaryLoaded ? summary.origin : "this tab"

  return (
    <main className="min-h-screen bg-background p-6 font-body text-foreground">
      <div className="mx-auto max-w-6xl">
        <header className={`${UI.panel} flex flex-wrap items-start justify-between gap-4 p-5`}>
          <div>
            <SiteLogo textClass="text-xl" sublabel="Pulse Observer report" />
            <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight">
              {reportView === "value"
                ? "Local value ledger"
                : reportView === "debug"
                  ? "Debug data"
                  : reportView === "contract"
                    ? "Done vs. declared"
                    : "Runtime audit"}
            </h1>
            <p className={`${TYPE.body} mt-2 break-all`}>
              {reportView === "value"
                ? "Local estimates from tracker presence observed by this extension. Not revenue measurements."
                : reportView === "debug"
                  ? `Raw pipeline data for ${originLabel} — fail-open, uncurated, for diagnosing what the product surfaces show.`
                  : reportView === "contract"
                    ? `What this page did, reconciled against the legal documents it links to — ${originLabel}`
                    : `The whole introduction ${originLabel} made to you — every read named, measured on your device, nothing sent anywhere. Then, how to take it back.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {reportView === "value" ? (
              <Button onClick={() => clearLedger().catch(() => flashClearState("failed", 2200))} variant="secondary">
                {clearState === "failed" ? "Clear failed" : "Clear ledger"}
              </Button>
            ) : null}
            <Button onClick={() => copyReport().catch(() => flashCopyState("failed", 2200))}>
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
            localStateObservations={model.localStateObservations}
            observations={model.browserCookieObservations}
            onScanComplete={loadSummary}
            origin={summary.origin}
            tabId={reportTabId()}
          />
        ) : reportView === "evidence" ? (
          <EvidenceView
            model={model}
            tabId={reportTabId()}
            onAnswerVisitFrequency={(frequency) => answerVisitFrequency(frequency).catch(() => undefined)}
            onOpenValueLedger={() => setReportView("value")}
            onToggleBlocking={toggleTrackerBlocking}
            onToggleShim={toggleTrackerShim}
            settings={settings}
            summary={summary}
          />
        ) : reportView === "debug" ? (
          <DebugView settings={settings} summary={summary} />
        ) : null}

        <ReportFooter />
      </div>
    </main>
  )
}

export default ReportTab
