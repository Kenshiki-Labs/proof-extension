import type { ObserverEvent } from "~core/domain/types"

export type ConsentSignalSignature = {
  global: string
  signalName: string
  standard: string
}

export const CONSENT_SIGNAL_SIGNATURES: ConsentSignalSignature[] = [
  { global: "__tcfapi", signalName: "IAB TCF consent API", standard: "IAB TCF v2" },
  { global: "__uspapi", signalName: "US Privacy consent API", standard: "IAB USP" },
  { global: "__gpp", signalName: "Global Privacy Platform API", standard: "IAB GPP" },
  { global: "__gpp_stub", signalName: "Global Privacy Platform stub", standard: "IAB GPP" },
  { global: "__fteSourcepointConsentConfig", signalName: "Sourcepoint consent configuration", standard: "Sourcepoint CMP" }
]

const SIGNATURES_BY_GLOBAL = new Map(CONSENT_SIGNAL_SIGNATURES.map((signature) => [signature.global, signature]))

export function consentSignalGlobalNames() {
  return CONSENT_SIGNAL_SIGNATURES.map((signature) => signature.global)
}

export function matchConsentSignal(globalName: string) {
  return SIGNATURES_BY_GLOBAL.get(globalName) ?? null
}

export function normalizeConsentSignal(event: ObserverEvent): ObserverEvent {
  if (event.eventType !== "consent_signal_observed") return event

  const globalName = typeof event.details?.global === "string" ? event.details.global : undefined
  const signature = globalName ? matchConsentSignal(globalName) : null
  if (!signature) {
    return {
      ...event,
      trackerId: undefined,
      companyId: undefined,
      firstParty: true,
      policyLabel: "unknown_first_party",
      blockability: "observable_only",
      status: "active",
      confidence: "weak",
      evidenceTier: "observed",
      evidence: [`Consent signal global ${globalName ?? "unknown"} was reported but is not a reviewed signature.`]
    }
  }

  return {
    ...event,
    trackerId: undefined,
    companyId: undefined,
    firstParty: true,
    policyLabel: "unknown_first_party",
    blockability: "observable_only",
    status: "active",
    confidence: "confirmed",
    evidenceTier: "observed",
    evidence: [`${signature.signalName} (${signature.standard}) was present in the page.`],
    details: { global: signature.global, standard: signature.standard, signalName: signature.signalName }
  }
}
