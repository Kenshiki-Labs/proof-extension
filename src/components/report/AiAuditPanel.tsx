import { useState } from "react"
import browser from "webextension-polyfill"

import { RuntimeMessageSchema } from "~core/contracts/messages"
import type { SiteSummary } from "~core/domain/types"
import { buildCopyPayload } from "~core/report/display"
import { useTransientState } from "~hooks/useTransientState"
import Button from "~components/system/Button"
import { TYPE, UI } from "~components/system/tokens"

import { MarkdownReport } from "~components/report/Markdown"
import { SectionTitle } from "~components/report/shared"

function safeReportSlug(origin: string) {
  try {
    return new URL(origin).hostname.replace(/[^a-z0-9.-]+/gi, "-").replace(/^-+|-+$/g, "") || "site"
  } catch {
    return "site"
  }
}

export function govHostname(origin: string) {
  try {
    const hostname = new URL(origin).hostname.toLowerCase()
    return hostname.endsWith(".gov") ? hostname : null
  } catch {
    return null
  }
}

export default function AiAuditReportPanel({ summary, tabId }: { summary: SiteSummary; tabId: number | null }) {
  const [copyState, flashCopyState] = useTransientState<"idle" | "copied" | "failed">("idle")
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState("")
  const [saveState, flashSaveState] = useTransientState<"idle" | "saved" | "failed">("idle")
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
      flashCopyState("copied", 1600)
    } catch {
      flashCopyState("failed", 2200)
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
      // Revoking synchronously can cancel the download before the browser
      // has started reading the blob URL — defer until it has.
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      flashSaveState("saved", 1600)
    } catch {
      flashSaveState("failed", 2200)
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
              <Button onClick={() => copyAiReport().catch(() => flashCopyState("failed", 2200))} variant="secondary">
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
