import browser from "webextension-polyfill"
import * as z from "zod"

import { runConsentAudit, type AnchorInput, type ConsentAuditRecord } from "~core/atlas/audit"
import { registrableDomain } from "~core/domain/party"
import type { RuntimeMessage } from "~core/domain/types"

// Live consent audit of the site currently seen (docs/consent-atlas-tab-spec.md).
// The page's own anchors replace the atlas crawler: harvest them on demand,
// classify legal-document links, fetch documents on this site's own domain,
// and run the deterministic clause detector. User-initiated only — never per
// navigation. Cached by registrable domain with a short TTL: repeat opens of
// the tab reuse the cached record instead of re-fetching up to five policy
// documents; a fresh audit runs once the TTL lapses.
const consentAudits = new Map<string, ConsentAuditRecord>()
const CONSENT_AUDIT_TTL_MS = 15 * 60 * 1000

const HarvestedAnchorsSchema = z.array(z.object({ text: z.string(), href: z.string() }))

export async function runConsentAuditForTab(tabId: number): Promise<RuntimeMessage> {
  let tabUrl: string
  try {
    const tab = await browser.tabs.get(tabId)
    if (!tab.url || !/^https?:/i.test(tab.url)) return { type: "CONSENT_AUDIT_FAILED", reason: "restricted_page" }
    tabUrl = tab.url
  } catch {
    return { type: "CONSENT_AUDIT_FAILED", reason: "no_tab" }
  }

  const domain = registrableDomain(new URL(tabUrl).hostname) || new URL(tabUrl).hostname

  const cached = consentAudits.get(domain)
  if (cached && Date.now() - cached.auditedAt < CONSENT_AUDIT_TTL_MS) {
    return { type: "CONSENT_AUDIT", payload: cached }
  }

  let anchors: AnchorInput[]
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "ISOLATED",
      func: () =>
        Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"), (anchor) => ({
          text: (anchor.textContent ?? "").trim().slice(0, 200),
          href: anchor.href
        }))
    })
    const parsedAnchors = HarvestedAnchorsSchema.safeParse(result?.result ?? [])
    if (!parsedAnchors.success) return { type: "CONSENT_AUDIT_FAILED", reason: "anchor_harvest_failed" }
    anchors = parsedAnchors.data
  } catch (error) {
    console.warn("Consent audit could not read this page's links", error)
    return { type: "CONSENT_AUDIT_FAILED", reason: "anchor_harvest_failed" }
  }

  const record = await runConsentAudit(domain, anchors, tabUrl)
  consentAudits.set(domain, record)
  return { type: "CONSENT_AUDIT", payload: record }
}
