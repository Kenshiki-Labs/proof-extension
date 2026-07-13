import "~style.css"

import { useEffect, useState } from "react"
import browser from "webextension-polyfill"
import type { Storage } from "webextension-polyfill"

import { RuntimeMessageSchema } from "~core/contracts/messages"
import { DEFAULT_SETTINGS } from "~core/domain/default-settings"
import { validateTrackerDatabase } from "~core/db/validate"
import type { UserSettings } from "~core/domain/types"
import Button from "~components/system/Button"
import Section from "~components/system/Section"
import { TYPE } from "~components/system/tokens"
import Toggle from "~components/system/Toggle"


const dbCounts = (() => {
  try {
    const db = validateTrackerDatabase()
    return { trackers: db.trackers.length, companies: db.companies.length, ok: true }
  } catch {
    return { trackers: 0, companies: 0, ok: false }
  }
})()

async function sendMessage(message: unknown) {
  const response = await browser.runtime.sendMessage(message)
  return RuntimeMessageSchema.safeParse(response)
}

function NumberField({
  label,
  value,
  min,
  max,
  suffix,
  onChange
}: {
  label: string
  value: number
  min: number
  max: number
  suffix: string
  onChange: (value: number) => void
}) {
  // Edit a local draft and commit on blur/Enter: writing on every keystroke
  // persisted transient states (clearing the field became 0, which for
  // maxEventsPerTab prunes every stored event mid-edit). HTML min/max do not
  // stop typing or clearing, so the commit clamps.
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])

  function commit() {
    const parsed = Number(draft)
    if (!Number.isFinite(parsed)) {
      setDraft(String(value))
      return
    }
    const clamped = Math.min(max, Math.max(min, Math.round(parsed)))
    setDraft(String(clamped))
    if (clamped !== value) onChange(clamped)
  }

  return (
    <label className="mt-2 flex items-center gap-2">
      <span className={TYPE.body}>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit()
        }}
        className="w-16 border border-border bg-card px-2 py-1 font-mono text-xs"
      />
      <span className={TYPE.body}>{suffix}</span>
    </label>
  )
}

function OptionsPage() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS)
  const [status, setStatus] = useState<string>("")

  useEffect(() => {
    async function loadSettings() {
      const parsed = await sendMessage({ type: "GET_SETTINGS" })
      if (parsed.success && parsed.data.type === "SETTINGS") {
        setSettings(parsed.data.payload)
      }
    }

    loadSettings().catch(() => setStatus("Could not load settings from the background service."))

    // Options can stay open while the popup or report flips a setting
    // (blocking a tracker, granting cookie metadata) — without this, the
    // blocked-tracker list here goes stale the moment that happens.
    function onStorageChanged(changes: Record<string, Storage.StorageChange>, area: string) {
      if (area !== "local") return
      if ("userSettings" in changes) loadSettings().catch(() => undefined)
    }

    browser.storage.onChanged.addListener(onStorageChanged)
    return () => browser.storage.onChanged.removeListener(onStorageChanged)
  }, [])

  async function updateSettings(patch: Partial<UserSettings>) {
    const next = { ...settings, ...patch }
    setSettings(next)
    const parsed = await sendMessage({ type: "UPDATE_SETTINGS", payload: patch })
    if (!parsed.success) setStatus("Settings update was not confirmed by the background service.")
  }

  async function clearLocalData() {
    setStatus("Clearing...")
    const parsed = await sendMessage({ type: "CLEAR_LOCAL_DATA" })
    setStatus(parsed.success ? "Local per-tab summaries cleared." : "Clear request was not confirmed.")
  }

  return (
    <main className="mx-auto max-w-[560px] p-6 font-mono text-foreground">
      <h1 className={TYPE.h1}>Pulse Observer Options</h1>

      <Section title="Retention">
        <NumberField
          label="Keep events for"
          value={settings.retentionDays}
          min={1}
          max={365}
          suffix="days"
          onChange={(value) => updateSettings({ retentionDays: value })}
        />
        <NumberField
          label="Keep at most"
          value={settings.maxEventsPerTab}
          min={1}
          max={500}
          suffix="events per tab"
          onChange={(value) => updateSettings({ maxEventsPerTab: value })}
        />
      </Section>

      <Section
        title="Blocking"
        description={
          'This is primarily an observer, not a blocker. There is no global on/off switch here — blocking is a per-tracker choice you make from the popup, right next to the specific company or script it applies to. Nothing is blocked by default.'
        }>
        {settings.blockedTrackerIds.length === 0 ? (
          <p className={TYPE.small}>No trackers are currently blocked.</p>
        ) : (
          <div>
            <p className={TYPE.small}>
              {settings.blockedTrackerIds.length} tracker{settings.blockedTrackerIds.length === 1 ? "" : "s"} currently blocked — each was enabled by a click in the popup or report; nothing blocks by default:
            </p>
            <ul className="mt-2 space-y-1.5">
              {[...settings.blockedTrackerIds].sort().map((trackerId) => (
                <li className="flex items-center gap-2" key={trackerId}>
                  <span className={`${TYPE.body} flex-1`}>{trackerId}</span>
                  <Button onClick={() => updateSettings({ blockedTrackerIds: settings.blockedTrackerIds.filter((id) => id !== trackerId) })}>
                    Unblock
                  </Button>
                </li>
              ))}
            </ul>
            <div className="mt-3">
              <Button variant="danger" onClick={() => updateSettings({ blockedTrackerIds: [] })}>
                Unblock all
              </Button>
            </div>
          </div>
        )}
      </Section>

      <Section
        title="Mitigation toggles"
        description="Each enabled toggle constrains a real API result and the report shows those reads as mitigated. A toggle is only offered once a hook actually constrains something.">
        <Toggle
          checked={settings.mitigateCanvas}
          onChange={(checked) => updateSettings({ mitigateCanvas: checked })}
          label="mitigate canvas"
          note="Answers canvas pixel reads with invisible per-session noise. This makes your canvas fingerprint unstable across sessions — different, not invisible: sites can detect that a fingerprint is randomized. May subtly affect canvas-based image tools. Applies to pages loaded from now on."
        />
        {/* Audio and WebGL hooks currently observe only — no code constrains
            their API results yet. A toggle that changes nothing would imply
            protection that does not exist, so these stay disabled until the
            mitigation paths are implemented. */}
        <Toggle checked={false} onChange={() => undefined} label="mitigate audio" disabled note="Not implemented yet — audio is observed, not constrained." />
        <Toggle checked={false} onChange={() => undefined} label="mitigate webgl" disabled note="Not implemented yet — WebGL is observed, not constrained." />
      </Section>

      <Section
        title="Privacy signals"
        description={
          "Global Privacy Control is a legal opt-out signal: under the CCPA and several state laws, sites that receive it must treat it as a do-not-sell/share request. Off by default — installing this extension never changes what a site receives until you opt in."
        }>
        <Toggle
          checked={settings.gpcEnabled}
          onChange={(checked) => updateSettings({ gpcEnabled: checked })}
          label="send Global Privacy Control"
          note="Adds the Sec-GPC header to requests (Chromium browsers) and exposes navigator.globalPrivacyControl to pages. GPC asks sites to stop selling or sharing your data; whether a site honors it is up to the site and its regulator. On Firefox, use the browser's built-in GPC setting instead — the header half here is Chromium-only."
        />
      </Section>

      <Section
        title="What we can't protect"
        description={
          "The honest boundary of any browser extension — including this one. Claims past this line would be false, so here is the line."
        }>
        <ul className="mt-2 space-y-1.5">
          <li className={TYPE.small}>
            Your IP address. It belongs to the network path, not the browser. Only something that actually routes your traffic elsewhere — a VPN, Tor — changes what servers see.
          </li>
          <li className={TYPE.small}>
            Your connection's transport fingerprint (TLS/JA3-style). It is produced below the layer any extension can reach.
          </li>
          <li className={TYPE.small}>
            Server-side collection. What a site's own servers record, share, or resell happens entirely outside the browser. The real lever is revocation at the source — see "Stop at source" in the audit report.
          </li>
          <li className={TYPE.small}>
            Identity you hand over. Logging in or providing an email links your activity regardless of any client-side protection.
          </li>
        </ul>
      </Section>

      <Section
        title="Local data"
        description={
          'Clears per-tab summaries stored in this browser. This does not affect data already collected by observed third parties — see "Stop at source" in the audit report for that.'
        }>
        <Button variant="danger" onClick={() => clearLocalData().catch(() => setStatus("Clear failed."))}>
          Clear local data
        </Button>
        {status ? <p className={`${TYPE.small} mt-2`}>{status}</p> : null}
      </Section>

      <Section title="Tracker DB">
        <p className={TYPE.small}>
          {dbCounts.ok
            ? `${dbCounts.trackers} tracker records across ${dbCounts.companies} companies, bundled at build time.`
            : "Tracker database failed validation — see console for details."}
        </p>
      </Section>
    </main>
  )
}

export default OptionsPage
