import "~style.css"

import { useEffect, useState } from "react"
import { Eye, LineChart } from "lucide-react"
import browser from "webextension-polyfill"
import type { Storage } from "webextension-polyfill"

import { RuntimeMessageSchema } from "~core/contracts/schemas"
import { EMPTY_SUMMARY, parseSiteSummaryResponse } from "~core/report/display"
import { buildWatcherListModel } from "~core/report/watchers"
import BetaBreadthNotice from "~components/BetaBreadthNotice"
import Button from "~components/system/Button"
import { NarrowingMirror } from "~components/NarrowingPanel"
import SiteLogo from "~components/system/SiteLogo"
import SurfaceSection from "~components/system/SurfaceSection"
import Toggle from "~components/system/Toggle"
import VerdictBanner from "~components/VerdictBanner"
import VisitFrequencyAsk from "~components/VisitFrequencyAsk"
import WatcherList from "~components/watchers/WatcherList"
import { TYPE, UI } from "~components/system/tokens"
import { buildNarrowingModel } from "~core/report/narrowing"
import { registrableDomain } from "~core/domain/party"
import { rollupObservedValuations } from "~core/domain/valuation"
import type { VisitFrequency } from "~core/domain/visit-frequency"
import type { SiteSummary, UserSettings } from "~core/domain/types"

// The glance surface (docs/surface-contract.md): under ten seconds, four
// elements — verdict, the watchers, one action, footer. Everything that
// used to stack here (metric tiles, money sections, event lists, runtime
// details) lives in the report tab or the debug view now. This file renders
// the contract's popup section and nothing else; if a block is not in the
// contract's popup list, it does not belong in this file.

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

const POPUP_WATCHER_LIMIT = 5
const COOKIE_METADATA_PERMISSION: chrome.permissions.Permissions = { permissions: ["cookies"] }

function updateCookiePermission(enabled: boolean): Promise<boolean> {
  if (typeof chrome === "undefined" || !chrome.permissions) return Promise.resolve(false)

  return new Promise((resolve) => {
    const callback = (granted: boolean) => {
      if (chrome.runtime?.lastError) {
        resolve(false)
        return
      }
      resolve(granted)
    }

    if (enabled) {
      chrome.permissions.request(COOKIE_METADATA_PERMISSION, callback)
      return
    }

    chrome.permissions.remove(COOKIE_METADATA_PERMISSION, callback)
  })
}

function domainForOrigin(origin: string): string | null {
  try {
    return registrableDomain(new URL(origin).hostname) || null
  } catch {
    return null
  }
}

function HeaderIconButton({ label, onClick, disabled = false, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      className="border border-border p-1.5 text-muted-foreground transition-colors hover:border-foreground hover:text-foreground disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button">
      {children}
    </button>
  )
}

function IndexPopup() {
  const [summary, setSummary] = useState<SiteSummary>(EMPTY_SUMMARY)
  const [settings, setSettings] = useState<UserSettings>(EMPTY_SETTINGS)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let liveTabId: number | undefined

    function applySummaryResponse(response: unknown) {
      const parsedResponse = parseSiteSummaryResponse(response)
      if (parsedResponse.success) {
        setLoadError(null)
        setSummary(parsedResponse.data)
        return
      }

      setLoadError(`Background returned a malformed site summary: ${parsedResponse.error.issues.map((issue) => issue.path.join(".") || issue.message).join(", ")}`)
    }

    async function loadSummary() {
      const [currentWindowTab] = await browser.tabs.query({ active: true, currentWindow: true })
      const [lastFocusedTab] = currentWindowTab?.id ? [currentWindowTab] : await browser.tabs.query({ active: true, lastFocusedWindow: true })
      const tab = currentWindowTab?.id ? currentWindowTab : lastFocusedTab
      if (!tab?.id) {
        setLoadError("Chrome did not expose an active tab to this popup.")
        return
      }

      liveTabId = tab.id
      // REFRESH_TAB_SCAN re-runs the active-tab injection probe — worth doing
      // once, on open, but not on every live-update tick below.
      const response = await browser.runtime.sendMessage({ type: "REFRESH_TAB_SCAN", tabId: tab.id })
      applySummaryResponse(response)
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

    // The popup can stay open while the page keeps triggering observer
    // events (or the user flips a setting elsewhere) — without this, the
    // verdict and watcher list freeze at whatever they were on open.
    function onStorageChanged(changes: Record<string, Storage.StorageChange>, area: string) {
      if (area !== "local") return
      if ("siteSummaries" in changes && liveTabId !== undefined) {
        browser.runtime.sendMessage({ type: "GET_SITE_SUMMARY", tabId: liveTabId }).then(applySummaryResponse).catch(() => undefined)
      }
      if ("userSettings" in changes) loadSettings().catch(() => undefined)
    }

    browser.storage.onChanged.addListener(onStorageChanged)
    return () => browser.storage.onChanged.removeListener(onStorageChanged)
  }, [])

  async function toggleTrackerBlocking(trackerId: string, blocked: boolean) {
    const blockedTrackerIds = blocked
      ? [...new Set([...settings.blockedTrackerIds, trackerId])]
      : settings.blockedTrackerIds.filter((id) => id !== trackerId)

    setSettings((current) => ({ ...current, blockedTrackerIds }))
    await browser.runtime.sendMessage({ type: "UPDATE_SETTINGS", payload: { blockedTrackerIds } }).catch(() => undefined)
  }

  async function toggleCookieMetadata(enabled: boolean) {
    const permissionUpdated = await updateCookiePermission(enabled)
    if (enabled && !permissionUpdated) return

    setSettings((current) => ({ ...current, cookieMetadataEnabled: enabled }))
    await browser.runtime.sendMessage({ type: "UPDATE_SETTINGS", payload: { cookieMetadataEnabled: enabled } }).catch(() => undefined)
  }

  async function openFullReport() {
    if (summary.tabId < 0) return
    await browser.tabs.create({ url: browser.runtime.getURL(`tabs/report.html?tabId=${summary.tabId}&view=evidence`) })
  }

  async function openValueLedger() {
    const query = summary.tabId >= 0 ? `?tabId=${summary.tabId}&view=value` : "?view=value"
    await browser.tabs.create({ url: browser.runtime.getURL(`tabs/report.html${query}`) })
  }

  async function openDebugView() {
    const query = summary.tabId >= 0 ? `?tabId=${summary.tabId}&view=debug` : "?view=debug"
    await browser.tabs.create({ url: browser.runtime.getURL(`tabs/report.html${query}`) })
  }

  async function openContractAudit() {
    if (summary.tabId < 0) return
    await browser.tabs.create({ url: browser.runtime.getURL(`tabs/report.html?tabId=${summary.tabId}&view=contract`) })
  }


  const watcherModel = buildWatcherListModel(summary.events, summary.origin, POPUP_WATCHER_LIMIT)
  const narrowingModel = buildNarrowingModel(summary.events)
  const siteDomain = domainForOrigin(summary.origin)
  const valuationRollup = rollupObservedValuations(summary.events)

  async function answerVisitFrequency(frequency: VisitFrequency) {
    if (!siteDomain) return
    const siteVisitFrequency = { ...settings.siteVisitFrequency, [siteDomain]: frequency }
    setSettings((current) => ({ ...current, siteVisitFrequency }))
    await browser.runtime.sendMessage({ type: "UPDATE_SETTINGS", payload: { siteVisitFrequency } }).catch(() => undefined)
  }

  return (
    <main className="max-h-[640px] min-w-[480px] overflow-y-auto bg-background p-4 font-body text-foreground">
      <header className={`${UI.panel} ${UI.inset} flex items-start justify-between gap-3`}>
        <SiteLogo textClass="text-base" sublabel="Pulse Observer" />
        <HeaderIconButton label="Open value ledger" onClick={() => openValueLedger().catch(() => undefined)}>
          <LineChart aria-hidden="true" size={16} strokeWidth={1.8} />
        </HeaderIconButton>
      </header>

      {loadError ? (
        <section className="mt-3.5 border border-danger bg-card p-3 shadow-sm" role="alert">
          <h2 className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-danger">Observer connection failed</h2>
          <p className={`${TYPE.small} mt-1 break-words`}>{loadError}</p>
        </section>
      ) : null}

      <NarrowingMirror model={narrowingModel} />
      <VerdictBanner compact summary={summary} />
      <BetaBreadthNotice compact />
      <section className={`mt-3.5 ${UI.panel} ${UI.inset}`}>
        <Toggle
          checked={settings.cookieMetadataEnabled}
          label="Observe browser cookie metadata"
          note="Adds HttpOnly/SameSite/Secure metadata to reports for pages you visit. Values are hidden unless you inspect them locally in the report."
          onChange={(checked) => toggleCookieMetadata(checked).catch(() => undefined)}
        />
      </section>
      <VisitFrequencyAsk
        annualHighUsd={valuationRollup.annualRevenueHighUsd}
        annualLowUsd={valuationRollup.annualRevenueLowUsd}
        compact
        domain={siteDomain}
        frequency={siteDomain ? (settings.siteVisitFrequency[siteDomain] ?? null) : null}
        onAnswer={(frequency) => answerVisitFrequency(frequency).catch(() => undefined)}
        revenueTrackerCount={valuationRollup.revenueTrackerCount}
      />

      {watcherModel.rows.length > 0 ? (
        <SurfaceSection className={`mt-3.5 ${UI.panel} ${UI.inset}`} icon={Eye} title="Who is watching — worst first">
          <WatcherList
            blockedTrackerIds={settings.blockedTrackerIds}
            model={watcherModel}
            onToggleBlocking={(trackerId, blocked) => toggleTrackerBlocking(trackerId, blocked).catch(() => undefined)}
          />
        </SurfaceSection>
      ) : null}

      <div className="mt-3.5">
        <Button disabled={summary.tabId < 0} onClick={() => openFullReport().catch(() => undefined)}>
          Open full report
        </Button>
      </div>

      <footer className={`${TYPE.small} mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5`}>
        <span className="break-all">{summary.origin}</span>
        <span className="flex items-center gap-3">
          <button
            className="underline hover:text-foreground disabled:no-underline disabled:opacity-40"
            disabled={summary.tabId < 0}
            onClick={() => openContractAudit().catch(() => undefined)}
            type="button">
            What you agreed to
          </button>
          <button className="underline hover:text-foreground" onClick={() => openDebugView().catch(() => undefined)} type="button">
            Debug data
          </button>
        </span>
      </footer>
    </main>
  )
}

export default IndexPopup
