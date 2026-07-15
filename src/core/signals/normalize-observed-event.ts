import type { TrackerRecord } from "~core/contracts/schemas"
import { matchTrackerRequest } from "~core/domain/network-match"
import type { ObserverEvent } from "~core/domain/types"

import { normalizeCanvasReadEvent } from "./canvas-read"
import { normalizeConsentSignal } from "./consent-signals"
import { normalizeDeviceFieldReadEvent } from "./device-field"
import { normalizeIdentityDigestEvent } from "./identity-digest"
import { normalizePersistenceEvent } from "./persistence"
import { enrichSdkDetection } from "./sdk-globals"
import { normalizeWebrtcProbeEvent } from "./webrtc-probe"

// The single composition point for turning a raw observed event — network-born
// or relayed from a MAIN-world hook — into the trusted, evidence-rebuilt event
// that gets stored. Kept out of background.ts so the service worker stays an
// orchestrator and this honesty-critical chain is unit-testable on its own.
//
// Order note: attribution enrichers (script/SDK → tracker DB) run first so a
// later normalizer sees the resolved trackerId; each per-type normalizer only
// touches its own eventType and passes everything else through untouched, so
// the nesting order among them does not change results.

// A script_injected event names the injected element and its src. The tracker
// DB join happens here so a known vendor's injection gets named (e.g.
// connect.facebook.net → Meta) with deterministic evidence, while unknown
// scripts stay honestly unattributed.
function enrichScriptInjection(event: ObserverEvent, trackers: TrackerRecord[]): ObserverEvent {
  if (event.eventType !== "script_injected" || event.trackerId) return event

  const src = typeof event.details?.src === "string" ? event.details.src : undefined
  if (!src) return event

  const match = matchTrackerRequest({ type: "script", url: src }, trackers)[0]
  if (!match) return event

  return {
    ...event,
    trackerId: match.tracker.id,
    companyId: match.tracker.companyId,
    firstParty: false,
    policyLabel: undefined,
    confidence: match.tracker.confidence,
    evidence: [...event.evidence, ...match.evidence]
  }
}

export type NormalizeObservedEventOptions = {
  trackers: TrackerRecord[]
  mitigateCanvas: boolean
}

export function normalizeObservedEvent(event: ObserverEvent, { trackers, mitigateCanvas }: NormalizeObservedEventOptions): ObserverEvent {
  return normalizeCanvasReadEvent(
    normalizePersistenceEvent(
      normalizeWebrtcProbeEvent(
        normalizeDeviceFieldReadEvent(
          normalizeIdentityDigestEvent(normalizeConsentSignal(enrichSdkDetection(enrichScriptInjection(event, trackers), trackers)))
        )
      )
    ),
    mitigateCanvas
  )
}
