import type { ObserverEvent } from "~core/domain/types"

// Why: "third-party" is a claim, not a heuristic. Comparing exact hostnames
// mislabels a site's own subdomain traffic (www.cnn.com → media.cnn.com) as
// third-party observation, which the spec's honesty rules forbid. Comparing
// registrable domains (eTLD+1-style) keeps the claim factual. The multi-part
// TLD set below covers common public-suffix second levels without vendoring
// the full Public Suffix List; unknown multi-part suffixes degrade toward
// treating hosts as same-site — under-claiming, never over-claiming.
const MULTI_PART_TLDS = new Set([
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "co.jp",
  "ne.jp",
  "or.jp",
  "com.au",
  "net.au",
  "org.au",
  "co.nz",
  "com.br",
  "com.mx",
  "co.in",
  "co.kr",
  "com.sg",
  "com.hk",
  "com.tw",
  "co.za",
  "com.ar",
  "com.tr",
  "com.cn"
])

const IPV4_PATTERN = /^\d{1,3}(\.\d{1,3}){3}$/

function isIpAddress(hostname: string) {
  return IPV4_PATTERN.test(hostname) || hostname.includes(":")
}

export function registrableDomain(hostname: string): string {
  const normalized = hostname.toLowerCase().replace(/\.$/, "")
  if (isIpAddress(normalized)) return normalized

  const labels = normalized.split(".").filter(Boolean)
  if (labels.length <= 2) return labels.join(".")

  const lastTwo = labels.slice(-2).join(".")
  const take = MULTI_PART_TLDS.has(lastTwo) ? 3 : 2
  return labels.slice(-take).join(".")
}

export function isSameSite(hostnameA: string, hostnameB: string): boolean {
  const a = registrableDomain(hostnameA)
  const b = registrableDomain(hostnameB)
  if (a.length === 0 || b.length === 0) return true
  return a === b
}

// Best-effort host for an event that may or may not carry a network URL —
// content/api-hook events (cookies, storage, SDK globals) have no request
// URL at all, so this falls back to the event's own origin. Shared by the
// party-counting logic (observer-counts.ts) and the per-tab graph builder
// (valuation.ts) so "what host is this" is answered exactly one way.
export function hostForEvent(event: ObserverEvent): string | null {
  const details = event.details
  if (details && typeof details.host === "string") return details.host
  if (details && typeof details.url === "string") {
    try {
      return new URL(details.url).hostname
    } catch {
      /* fall through to origin */
    }
  }
  try {
    return new URL(event.origin).hostname
  } catch {
    return null
  }
}
