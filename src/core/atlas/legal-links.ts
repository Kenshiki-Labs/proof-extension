import { DOC_TYPES } from "~core/atlas/rules"
import type { DocType } from "~core/atlas/types"

// Legal-link discovery and classification (ported from
// proof/sample/consent-atlas/src/legalLinks.js). Given anchors scraped from a
// homepage (text + href), classify each into a document type. Pure functions;
// uses the global URL constructor, which is available in the extension runtime.

export type LegalAnchor = { text?: string; href?: string }

export type AnchorClassification = { type: DocType; confidence: number }

export type DiscoveredLink = { url: string; text: string; confidence: number }

type Matcher = { type: DocType; text: RegExp; url: RegExp; weight: number }

// Ordered matchers. First match wins for a given anchor. Order matters: more
// specific types (cookie, subscription) are checked before the broad
// privacy/terms buckets so "Cookie Policy" is not swallowed by "Policy".
const MATCHERS: readonly Matcher[] = [
  {
    type: DOC_TYPES.COOKIE,
    text: /\bcookies?\b(?:\s+(policy|notice|settings|preferences))?/i,
    url: /(cookie|cookies)(-|_)?(policy|notice|settings|preferences)?/i,
    weight: 0.6
  },
  {
    type: DOC_TYPES.SUBSCRIPTION,
    text: /\b(subscription|billing|auto[-\s]?renew|refund)\b/i,
    url: /(subscription|billing|refund|auto-?renew)/i,
    weight: 0.5
  },
  {
    type: DOC_TYPES.COMMUNITY,
    text: /\b(community\s+guidelines|community\s+standards|content\s+policy|acceptable\s+use)\b/i,
    url: /(community|guidelines|standards|acceptable-?use)/i,
    weight: 0.5
  },
  {
    type: DOC_TYPES.PRIVACY,
    text: /\b(privacy(\s+(policy|notice|statement|center|centre))?|data\s+(policy|protection|privacy)|your\s+privacy)\b/i,
    url: /(privacy|data-?protection|privacypolicy|privacy-?center|policycenter)/i,
    weight: 0.9
  },
  {
    type: DOC_TYPES.TERMS,
    text: /\b(terms(\s+(of\s+(use|service|sale))?|and\s+conditions)?|conditions\s+of\s+use|user\s+agreement|legal\s+terms)\b/i,
    url: /(terms|tos|conditions|user-?agreement|legal\/?terms|eula)/i,
    weight: 0.9
  }
]

// Classify a single anchor.
export function classifyAnchor(anchor: LegalAnchor | null | undefined): AnchorClassification | null {
  const text = (anchor?.text || "").trim()
  const href = (anchor?.href || "").trim()
  if (!text && !href) return null

  for (const m of MATCHERS) {
    const textHit = text ? m.text.test(text) : false
    const urlHit = href ? m.url.test(href) : false
    if (textHit || urlHit) {
      // Both signals agreeing raises confidence; a single signal is weaker.
      const confidence = textHit && urlHit ? Math.min(1, m.weight + 0.1) : m.weight * (textHit ? 1 : 0.85)
      return { type: m.type, confidence: Number(confidence.toFixed(2)) }
    }
  }
  return null
}

// Classify a list of anchors and return the best candidate URLs per doc type.
// Absolute URLs are preferred; the highest-confidence anchor wins ties.
export function discoverLegalLinks(
  anchors: readonly LegalAnchor[] | null | undefined,
  baseUrl?: string
): Partial<Record<DocType, DiscoveredLink[]>> {
  const byType: Partial<Record<DocType, DiscoveredLink[]>> = {}
  for (const a of anchors ?? []) {
    const cls = classifyAnchor(a)
    if (!cls) continue
    const url = resolveUrl(a.href, baseUrl)
    if (!url) continue
    ;(byType[cls.type] ??= []).push({ url, text: (a.text || "").trim(), confidence: cls.confidence })
  }
  // Sort each bucket by confidence desc, dedupe by URL.
  for (const type of Object.keys(byType) as DocType[]) {
    const bucket = byType[type]
    if (!bucket) continue
    const seen = new Set<string>()
    byType[type] = bucket.sort((x, y) => y.confidence - x.confidence).filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)))
  }
  return byType
}

// Resolve a possibly-relative href against a base URL. Returns null for
// non-navigable hrefs (javascript:, mailto:, #fragments).
export function resolveUrl(href: string | undefined, baseUrl?: string): string | null {
  if (!href) return null
  const h = href.trim()
  if (!h || h.startsWith("#") || /^(javascript|mailto|tel):/i.test(h)) return null
  try {
    return new URL(h, baseUrl || undefined).toString()
  } catch {
    return null
  }
}
