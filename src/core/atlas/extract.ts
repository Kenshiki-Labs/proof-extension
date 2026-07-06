import type { DocumentRecord } from "~core/atlas/types"

// HTML/text extraction utilities ported from
// proof/sample/consent-atlas/src/extract.js. Pure and browser-safe: no
// node: imports, no fs.

/** Minimum readable length before we consider extraction "thin". */
export const MIN_CONTENT_LENGTH = 400

// Deterministic FNV-1a 32-bit hash of normalized text (adapted from the
// `hash32` probe in src/core/signals/browser-surface.ts). The reference engine
// used node:crypto sha256; we swap to a synchronous, browser-safe FNV-1a
// because this hash is only used for change-detection. The `fnv1a:` prefix
// makes it unmistakably NOT sha256.
export function textHash(text: string): string {
  const normalized = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
  let hash = 2166136261
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return "fnv1a:" + (hash >>> 0).toString(16).padStart(8, "0")
}

// Convert raw HTML to readable text. Fallback path used for fixtures and
// offline runs; a live crawl prefers the browser's innerText.
export function htmlToText(html: string): string {
  if (!html) return ""
  let s = String(html)
  // Drop non-content elements entirely.
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
  s = s.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
  s = s.replace(/<!--[\s\S]*?-->/g, " ")
  // Preserve block boundaries as newlines so paragraphs stay separable.
  s = s.replace(/<\/(p|div|section|article|li|h[1-6]|br|tr)>/gi, "\n")
  s = s.replace(/<br\b[^>]*\/?>/gi, "\n")
  // Strip remaining tags.
  s = s.replace(/<[^>]+>/g, " ")
  // Decode a small set of common entities.
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
  // Collapse whitespace but keep line breaks.
  s = s
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
  return s.trim()
}

// Extract a "last updated" date if the document states one.
export function extractLastUpdated(text: string): string | null {
  if (!text) return null
  const m = text.match(
    /(?:last\s+updated|last\s+modified|effective(?:\s+date)?|updated)\s*:?\s*((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i
  )
  return m && m[1] ? m[1].trim() : null
}

// Produce short excerpts (leading readable paragraphs) for storage/preview.
export function makeExcerpts(text: string, count = 3, maxLen = 320): string[] {
  if (!text) return []
  return text
    .split(/\n{1,}/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 40)
    .slice(0, count)
    .map((p) => (p.length > maxLen ? p.slice(0, maxLen - 1).trimEnd() + "…" : p))
}

// Build a document extraction record from readable text.
export function buildDocument({
  url,
  finalUrl,
  title,
  text
}: {
  url: string
  finalUrl?: string
  title?: string
  text: string
}): DocumentRecord {
  const readable = (text || "").trim()
  return {
    url,
    final_url: finalUrl || url,
    title: title || null,
    last_updated: extractLastUpdated(readable),
    text_hash: textHash(readable),
    text_length: readable.length,
    thin_content: readable.length < MIN_CONTENT_LENGTH,
    excerpts: makeExcerpts(readable)
  }
}
