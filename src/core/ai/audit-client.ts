import browser from "webextension-polyfill"

import type { RuntimeMessage } from "~core/domain/types"

// The audit prompt, the model choice, and the product OpenRouter key all live
// in the proxy (worker/ai-audit-proxy) — nothing credential-shaped ships in
// this bundle. Update this URL if the worker is deployed under another route.
const AI_AUDIT_PROXY_URL = "https://pulse-ai-audit.pulsekenshikilabscom.workers.dev/"

export function urlIsGov(url: string | undefined) {
  if (!url) return false
  try {
    return new URL(url).hostname.toLowerCase().endsWith(".gov")
  } catch {
    return false
  }
}

export async function generateAiAuditReport({ auditPayload, tabId }: { auditPayload: string; tabId: number }): Promise<RuntimeMessage> {
  try {
    // Gate on the tab's real URL, not anything asserted inside the payload —
    // the payload is caller-supplied text and proves nothing about the site.
    let tab: browser.Tabs.Tab
    try {
      tab = await browser.tabs.get(tabId)
    } catch {
      return { type: "AI_AUDIT_REPORT_FAILED", error: "The audited tab is no longer open." }
    }
    if (!urlIsGov(tab.url)) {
      return { type: "AI_AUDIT_REPORT_FAILED", error: "AI audit reports are enabled only for .gov origins." }
    }

    const response = await fetch(AI_AUDIT_PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auditPayload })
    })

    const data = (await response.json().catch(() => null)) as { error?: unknown; report?: unknown } | null
    if (!response.ok) {
      const error = typeof data?.error === "string" ? data.error : `The audit service is unavailable right now (${response.status}).`
      return { type: "AI_AUDIT_REPORT_FAILED", error }
    }
    if (typeof data?.report !== "string" || data.report.trim().length === 0) {
      return { type: "AI_AUDIT_REPORT_FAILED", error: "The audit service returned an empty report." }
    }

    return { type: "AI_AUDIT_REPORT", payload: { report: data.report.trim() } }
  } catch (error) {
    return { type: "AI_AUDIT_REPORT_FAILED", error: error instanceof Error ? error.message : String(error) }
  }
}
