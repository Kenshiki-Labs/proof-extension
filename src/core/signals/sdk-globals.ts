import type { ObserverEvent } from "~core/domain/types"
import type { TrackerRecord } from "~core/contracts/schemas"

// Distinctive vendor globals only. A signature earns a place here when the
// property name is specific enough that its presence is a known-library
// match (spec: "confirmed"), not merely category-shaped behavior. Generic
// names pages commonly define themselves (window.analytics, window.s) are
// deliberately excluded — a false vendor attribution is worse than a miss.
// dataLayer is the one "probable": it is Google tooling by convention, but
// sites also hand-roll it for gtag without GTM.
export type SdkGlobalSignature = {
  global: string
  trackerId: string
  sdkName: string
  confidence: "confirmed" | "probable"
}

export const SDK_GLOBAL_SIGNATURES: SdkGlobalSignature[] = [
  { global: "FS", trackerId: "fullstory", sdkName: "FullStory", confidence: "confirmed" },
  { global: "hj", trackerId: "hotjar", sdkName: "Hotjar", confidence: "confirmed" },
  { global: "fbq", trackerId: "meta-pixel", sdkName: "Meta Pixel", confidence: "confirmed" },
  { global: "ttq", trackerId: "tiktok-pixel", sdkName: "TikTok Pixel", confidence: "confirmed" },
  { global: "gtag", trackerId: "google-analytics", sdkName: "Google tag", confidence: "confirmed" },
  { global: "dataLayer", trackerId: "google-tag-manager", sdkName: "Google Tag Manager dataLayer", confidence: "probable" },
  { global: "mixpanel", trackerId: "mixpanel", sdkName: "Mixpanel", confidence: "confirmed" },
  { global: "amplitude", trackerId: "amplitude", sdkName: "Amplitude", confidence: "confirmed" },
  { global: "Intercom", trackerId: "intercom", sdkName: "Intercom Messenger", confidence: "confirmed" },
  { global: "drift", trackerId: "drift", sdkName: "Drift", confidence: "confirmed" },
  { global: "optimizely", trackerId: "optimizely", sdkName: "Optimizely", confidence: "confirmed" },
  { global: "snaptr", trackerId: "snap-pixel", sdkName: "Snap Pixel", confidence: "confirmed" },
  { global: "pintrk", trackerId: "pinterest-tag", sdkName: "Pinterest Tag", confidence: "confirmed" },
  { global: "twq", trackerId: "twitter-pixel", sdkName: "Twitter/X Pixel", confidence: "confirmed" },
  { global: "ym", trackerId: "yandex-metrica", sdkName: "Yandex Metrica", confidence: "confirmed" },
  { global: "clarity", trackerId: "microsoft-clarity", sdkName: "Microsoft Clarity", confidence: "confirmed" },
  { global: "CE2", trackerId: "crazyegg", sdkName: "Crazy Egg", confidence: "confirmed" },
  { global: "criteo_q", trackerId: "criteo", sdkName: "Criteo OneTag", confidence: "confirmed" },
  { global: "DD_RUM", trackerId: "datadog-rum", sdkName: "Datadog RUM", confidence: "confirmed" },
  { global: "_taboola", trackerId: "taboola", sdkName: "Taboola", confidence: "confirmed" },
  { global: "obApi", trackerId: "outbrain", sdkName: "Outbrain", confidence: "confirmed" },
  { global: "_qevents", trackerId: "quantcast", sdkName: "Quantcast Measure", confidence: "confirmed" },
  { global: "appboy", trackerId: "braze", sdkName: "Braze (Appboy)", confidence: "confirmed" },
  { global: "_hsq", trackerId: "hubspot", sdkName: "HubSpot analytics queue", confidence: "confirmed" },
  { global: "uetq", trackerId: "microsoft-ads", sdkName: "Microsoft Advertising UET queue", confidence: "confirmed" },
  { global: "rdt", trackerId: "reddit-pixel", sdkName: "Reddit Pixel", confidence: "confirmed" },
  { global: "TTDUniversalPixelApi", trackerId: "the-trade-desk", sdkName: "The Trade Desk Universal Pixel", confidence: "confirmed" },
  { global: "apstag", trackerId: "amazon-ads", sdkName: "Amazon Publisher Services (apstag)", confidence: "confirmed" },
  // Set by the site's own inline config snippet before (and regardless of
  // whether) the Insight Tag script actually loads — proves intent to load
  // LinkedIn tooling, not that the SDK ran. Same reasoning as dataLayer.
  { global: "_linkedin_partner_id", trackerId: "linkedin-insight", sdkName: "LinkedIn Insight Tag", confidence: "probable" }
]

const SIGNATURES_BY_GLOBAL = new Map(SDK_GLOBAL_SIGNATURES.map((signature) => [signature.global, signature]))

export function sdkGlobalNames() {
  return SDK_GLOBAL_SIGNATURES.map((signature) => signature.global)
}

export function matchSdkGlobal(globalName: string) {
  return SIGNATURES_BY_GLOBAL.get(globalName) ?? null
}

// The main world reports only the raw fact — "this global name exists".
// The vendor join happens here, against the signature table and the tracker
// DB, so a page posting forged messages can at most claim a global name and
// never inject its own trackerId, companyId, or confidence into evidence.
export function enrichSdkDetection(event: ObserverEvent, trackers: TrackerRecord[]): ObserverEvent {
  if (event.eventType !== "sdk_detected") return event

  const globalName = typeof event.details?.global === "string" ? event.details.global : undefined
  const signature = globalName ? matchSdkGlobal(globalName) : null
  const tracker = signature ? trackers.find((item) => item.id === signature.trackerId) : undefined
  if (!signature || !tracker) {
    // Unknown or forged global names carry no vendor claim at all — and no
    // block claim either: without a tracker match there is no DNR rule, so
    // "network block available" would be false certainty.
    return {
      ...event,
      trackerId: undefined,
      companyId: undefined,
      blockability: "observable_only",
      confidence: "weak",
      evidence: [`Global variable ${globalName ?? "unknown"} was reported but matches no known SDK signature.`]
    }
  }

  return {
    ...event,
    trackerId: tracker.id,
    companyId: tracker.companyId,
    firstParty: false,
    policyLabel: undefined,
    confidence: signature.confidence,
    evidence: [
      `Global variable ${signature.global} characteristic of ${signature.sdkName} was present in the page.`,
      "SDK globals remain visible even when the loading request was cached, first-party proxied, or CNAME-cloaked."
    ]
  }
}
