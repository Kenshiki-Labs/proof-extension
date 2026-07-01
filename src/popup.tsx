import { useEffect, useState } from "react"
import browser from "webextension-polyfill"

import { RuntimeMessageSchema } from "~core/contracts/schemas"
import type { SiteSummary } from "~core/domain/types"

const EMPTY_SUMMARY: SiteSummary = {
  origin: "unknown",
  tabId: -1,
  activeCompanies: [],
  blockedCompanies: [],
  mitigatedCompanies: [],
  exposedSignals: [],
  cannotBlockSignals: [],
  events: [],
  incomplete: true,
  updatedAt: 0
}

function IndexPopup() {
  const [summary, setSummary] = useState<SiteSummary>(EMPTY_SUMMARY)

  useEffect(() => {
    async function loadSummary() {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) return

      const response = await browser.runtime.sendMessage({
        type: "GET_SITE_SUMMARY",
        tabId: tab.id
      })

      const parsedResponse = RuntimeMessageSchema.safeParse(response)
      if (parsedResponse.success && parsedResponse.data.type === "SITE_SUMMARY") {
        setSummary(parsedResponse.data.payload)
      }
    }

    loadSummary().catch(() => setSummary(EMPTY_SUMMARY))
  }, [])

  return (
    <div
      style={{
        color: "#111",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        minWidth: 360,
        padding: 16
      }}>
      <h1 style={{ fontSize: 16, margin: "0 0 12px" }}>Pulse Observer</h1>
      <section>
        <h2 style={{ fontSize: 12, margin: "0 0 8px", textTransform: "uppercase" }}>
          Watching now
        </h2>
        <p style={{ margin: 0 }}>{summary.origin}</p>
      </section>
      <section style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 12, margin: "0 0 8px", textTransform: "uppercase" }}>
          Still exposed
        </h2>
        <p style={{ margin: 0 }}>
          {summary.events.length === 0
            ? "No observer events have been recorded for this tab yet."
            : `${summary.events.length} observer events recorded.`}
        </p>
      </section>
      {summary.incomplete ? (
        <p style={{ margin: "16px 0 0" }}>
          This tab summary is incomplete until background and content events arrive.
        </p>
      ) : null}
    </div>
  )
}

export default IndexPopup