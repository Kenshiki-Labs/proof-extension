import { useEffect, useRef, useState } from "react"
import { ClipboardCopy } from "lucide-react"
import browser from "webextension-polyfill"

import { RuntimeMessageSchema } from "~core/contracts/messages"
import type { CookieMetadataScanResult, CookieValueInspectEntry, CookieValueInspectResult } from "~core/domain/types"
import type { DisplayObservation } from "~core/report/display"
import { buildCookieMetadataRollup, buildLocalStatePurposeRollup, buildLocalStateRollup, formatCopyEvent } from "~core/report/display"
import { useTransientState } from "~hooks/useTransientState"
import Button from "~components/system/Button"
import Disclosure from "~components/system/Disclosure"
import { TYPE, UI } from "~components/system/tokens"

import ObservationTable from "~components/report/ObservationTable"
import { Metric, SectionTitle } from "~components/report/shared"

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

export default function LocalStateSection({
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
  const [localStateCopyState, flashLocalStateCopyState] = useTransientState<"idle" | "copied" | "failed">("idle")
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
    flashLocalStateCopyState("copied", 2000)
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
          onClick={() => copyLocalState().catch(() => flashLocalStateCopyState("failed", 2000))}
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
            {[...localStateRollup.takeaways, ...webStoragePurposeRollup.takeaways, ...cookieRollup.takeaways].map((takeaway, index) => <li key={`${takeaway}-${index}`}>{takeaway}</li>)}
            <li>Cookie and storage values can name server-side records, carts, sessions, or preferences; the browser can show the local token, but not what the server attaches to it.</li>
          </ul>
        ) : (
          <p className={`${TYPE.body} mt-3`}>{enabled ? "No matching first-party browser cookie metadata has been recorded for this page yet." : "Enable the popup setting to inspect this page’s browser cookie metadata."}</p>
        )}
      </section>
      <CookieValueInspectPanel enabled={enabled} tabId={tabId} />
      <Disclosure className="mt-4" labelStyle="label" summary="Raw cookie metadata evidence">
        <ObservationTable observations={observations} readOnly />
      </Disclosure>
      <Disclosure className="mt-4" labelStyle="label" summary="Raw local-state evidence">
        <ObservationTable observations={localStateObservations} readOnly />
      </Disclosure>
    </section>
  )
}
