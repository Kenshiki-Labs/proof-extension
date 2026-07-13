import { detectGiveups } from "~core/atlas/detect"
import { buildDocument, htmlToText, MIN_CONTENT_LENGTH } from "~core/atlas/extract"
import { discoverLegalLinks } from "~core/atlas/legal-links"
import type { DocType, DocumentText, Giveup } from "~core/atlas/types"
import { registrableDomain } from "~core/domain/party"

// Live consent audit for the site the extension is currently on
// (docs/consent-atlas-tab-spec.md). Repurposes the atlas engine: the page's
// own anchors replace the crawler, a plain fetch replaces Playwright, and the
// documents fetched are legal documents THIS PAGE LINKS TO.
//
// Fetch targets are constrained to the tab's own registrable domain: a page
// anchor must not be able to point the extension's privileged, CORS-exempt
// fetch at an arbitrary host. Off-domain policy centers (cnn.com/privacy →
// wbdprivacy.com) still work because the constraint is on the INITIAL target;
// redirects may land elsewhere and the final origin is recorded in the
// provenance so the user sees exactly where the document came from.
//
// User-initiated, never automatic per navigation. Deduped by URL: the same
// document classified under two doc types is fetched once.

export type AnchorInput = { text?: string; href?: string }

export type AuditedDocument = {
  docType: DocType
  url: string
  finalUrl: string
  lastUpdated: string | null
  textHash: string
  textLength: number
  thinContent: boolean
  fetchError: string | null
}

export type ConsentAuditRecord = {
  domain: string
  auditedAt: number
  // Which documents this page's own anchors led to, and what each fetch
  // yielded — the provenance footer renders from this, so a failed fetch is
  // recorded, never silently dropped.
  documents: AuditedDocument[]
  giveups: Giveup[]
  // True when anchor discovery found no legal documents at all — the honest
  // empty state ("no public policy documents were discoverable from this
  // page"), distinct from "documents found but fetches failed".
  nothingDiscovered: boolean
}

const FETCH_TIMEOUT_MS = 15_000
const MAX_DOCUMENTS = 5

function sameRegistrableDomain(url: string, domain: string): boolean {
  try {
    const host = new URL(url).hostname
    return registrableDomain(host) === domain || host === domain
  } catch {
    return false
  }
}

async function fetchDocumentText(url: string, fetchImpl: typeof fetch): Promise<{ finalUrl: string; text: string } | { error: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetchImpl(url, { signal: controller.signal, credentials: "omit", redirect: "follow" })
    if (!response.ok) return { error: `http_${response.status}` }
    const html = await response.text()
    return { finalUrl: response.url || url, text: htmlToText(html) }
  } catch (error) {
    return { error: error instanceof Error && error.name === "AbortError" ? "timeout" : "fetch_failed" }
  } finally {
    clearTimeout(timer)
  }
}

export async function runConsentAudit(
  domain: string,
  anchors: AnchorInput[],
  baseUrl: string,
  fetchImpl: typeof fetch = fetch
): Promise<ConsentAuditRecord> {
  const discovered = discoverLegalLinks(anchors, baseUrl)
  const docTypes = Object.keys(discovered) as DocType[]

  const audited: AuditedDocument[] = []
  const documentsForDetection: Partial<Record<DocType, DocumentText>> = {}
  // One fetch per URL even when two doc types resolve to the same page; the
  // second doc type reuses the first result.
  const fetchedByUrl = new Map<string, { finalUrl: string; text: string } | { error: string }>()

  for (const docType of docTypes.slice(0, MAX_DOCUMENTS)) {
    // Highest-confidence candidate on the tab's own registrable domain; a
    // doc type whose only candidates point off-domain is skipped entirely
    // rather than fetched.
    const best = discovered[docType]?.find((candidate) => sameRegistrableDomain(candidate.url, domain))
    if (!best) continue
    const result = fetchedByUrl.get(best.url) ?? (await fetchDocumentText(best.url, fetchImpl))
    fetchedByUrl.set(best.url, result)
    if ("error" in result) {
      audited.push({
        docType,
        url: best.url,
        finalUrl: best.url,
        lastUpdated: null,
        textHash: "",
        textLength: 0,
        thinContent: true,
        fetchError: result.error
      })
      continue
    }
    const document = buildDocument({ url: best.url, finalUrl: result.finalUrl, text: result.text })
    audited.push({
      docType,
      url: best.url,
      finalUrl: result.finalUrl,
      lastUpdated: document.last_updated,
      textHash: document.text_hash,
      textLength: document.text_length,
      thinContent: document.text_length < MIN_CONTENT_LENGTH,
      fetchError: null
    })
    // Thin documents (JS-rendered shells) are recorded in provenance but must
    // not feed detection: "the contract is silent" may only rest on documents
    // that were actually readable as text.
    if (document.text_length >= MIN_CONTENT_LENGTH) {
      documentsForDetection[docType] = { url: best.url, final_url: result.finalUrl, __text: result.text }
    }
  }

  return {
    domain,
    auditedAt: Date.now(),
    documents: audited,
    giveups: detectGiveups(documentsForDetection),
    nothingDiscovered: docTypes.length === 0
  }
}
