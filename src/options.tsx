import "~style.css"

import { useEffect, useState } from "react"
import browser from "webextension-polyfill"

import { RuntimeMessageSchema } from "~core/contracts/schemas"
import { validateTrackerDatabase } from "~core/db/validate"
import type { UserSettings } from "~core/domain/types"
import Button from "~components/system/Button"
import Section from "~components/system/Section"
import { TYPE } from "~components/system/tokens"
import Toggle from "~components/system/Toggle"

const DEFAULT_SETTINGS: UserSettings = {
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
        description="These flag which content-mitigatable classes are reported as mitigated once a hook actually constrains the API result. They do not themselves add new hooks.">
        <Toggle
          checked={settings.mitigateCanvas}
          onChange={(checked) => updateSettings({ mitigateCanvas: checked })}
          label="mitigate canvas"
        />
        {/* Audio and WebGL hooks currently observe only — no code constrains
            their API results yet. A toggle that changes nothing would imply
            protection that does not exist, so these stay disabled until the
            mitigation paths are implemented. */}
        <Toggle checked={false} onChange={() => undefined} label="mitigate audio" disabled note="Not implemented yet — audio is observed, not constrained." />
        <Toggle checked={false} onChange={() => undefined} label="mitigate webgl" disabled note="Not implemented yet — WebGL is observed, not constrained." />
      </Section>

      <Section
        title="Local data"
        description={
          'Clears per-tab summaries stored in this browser. This does not affect data already collected by observed third parties — see "Stop at source" in the popup for that.'
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
