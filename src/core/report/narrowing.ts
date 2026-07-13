import { buildNarrowing, formatCandidates, POPULATION_BASE, type IdentityReading, type NarrowingStep } from "~core/domain/identity-entropy"
import { countWatchingObservers } from "~core/domain/observer-counts"
import type { ObserverEvent } from "~core/domain/types"

export type NarrowingModel = {
  values: string[]
  steps: NarrowingStep[]
  cumulativeBits: number
  remaining: number
  watching: number
  hasConsentSignal: boolean
  thirdPartyContacts: number
}

function hasValue(value: unknown) {
  return value !== undefined && value !== null && value !== "" && !/unavailable|not exposed|blocked/i.test(String(value))
}

function latestBrowserSurface(events: ObserverEvent[]) {
  return [...events]
    .filter((event) => event.source === "extension-scan" && event.eventType === "browser_surface")
    .sort((left, right) => right.observedAt - left.observedAt)[0]
}

function eventCount(event: ObserverEvent) {
  return event.count ?? 1
}

function thirdPartyContactCount(events: ObserverEvent[]) {
  return events
    .filter((event) => !event.firstParty && event.status === "active" && event.source === "network")
    .reduce((total, event) => total + eventCount(event), 0)
}

export function buildNarrowingModel(events: ObserverEvent[]): NarrowingModel {
  const surface = latestBrowserSurface(events)
  const details = surface?.details ?? {}
  const readings: IdentityReading[] = []
  const values: string[] = []

  if (hasValue(details.timezone)) {
    const detail = String(details.timezone)
    values.push(detail)
    readings.push({ key: "timezone", detail })
  }

  if (hasValue(details.screen)) {
    // devicePixelRatio on a zoomed/scaled display is a raw float artifact
    // (2.200000047683716) — two decimals carries the same identifying
    // information without the noise.
    const ratio = Number(details.pixelRatio)
    const ratioLabel = Number.isFinite(ratio) && ratio > 0 ? String(Math.round(ratio * 100) / 100) : "1"
    const detail = `${String(details.screen)} @${ratioLabel}x`
    values.push(detail)
    readings.push({ key: "screen", detail })
  }

  if (hasValue(details.platform) || hasValue(details.language)) {
    const parts = [details.platform, details.language].filter(hasValue).map(String)
    const detail = parts.join(" · ")
    values.push(detail)
    readings.push({ key: "platformLanguage", detail })
  }

  if (hasValue(details.gpuRenderer)) {
    const detail = String(details.gpuRenderer)
    values.push(detail)
    readings.push({ key: "gpu", detail })
  }

  if (hasValue(details.canvasHash)) {
    const detail = String(details.canvasHash)
    values.push("canvas hash")
    readings.push({ key: "canvas", detail })
  }

  if (hasValue(details.audioFingerprint)) {
    const detail = String(details.audioFingerprint)
    values.push("audio fingerprint")
    readings.push({ key: "audio", detail })
  }

  if (hasValue(details.fontSummary)) {
    const detail = String(details.fontSummary)
    values.push(detail)
    readings.push({ key: "fonts", detail })
  }

  // NOT pushed into the mirror's "what this page could read about you" list:
  // that list is device surfaces read FROM the browser (timezone, GPU, …),
  // each a true local read. Third-party contacts are an OUTBOUND fact, and the
  // raw count is an inflated sum of network events (cache-validator repeats
  // merge into large counts), so "IP left N times" is neither the right
  // category nor a defensible number. Kept on the model as a raw diagnostic
  // count only; the honest "who received requests" story is the watcher list.
  const thirdPartyContacts = thirdPartyContactCount(events)
  const narrowing = buildNarrowing(readings)

  return {
    values,
    steps: narrowing.steps,
    cumulativeBits: narrowing.cumulativeBits,
    remaining: narrowing.remaining,
    watching: countWatchingObservers(events),
    hasConsentSignal: events.some((event) => event.eventType === "consent_signal_observed"),
    thirdPartyContacts
  }
}

export function formatBits(value: number) {
  return value.toFixed(2).replace(/\.00$/, "")
}

export { formatCandidates, POPULATION_BASE }
export type { NarrowingStep }
