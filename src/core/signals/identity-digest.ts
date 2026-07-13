import type { ObserverEvent } from "~core/domain/types"

export function normalizeIdentityDigestEvent(event: ObserverEvent): ObserverEvent {
  if (event.eventType !== "identity_digest_observed") return event

  const algorithm = typeof event.details?.algorithm === "string" ? event.details.algorithm.toUpperCase() : "SHA-256"
  const inputBytes =
    typeof event.details?.inputBytes === "number" && Number.isFinite(event.details.inputBytes) ? event.details.inputBytes : 0

  return {
    ...event,
    trackerId: undefined,
    companyId: undefined,
    firstParty: true,
    policyLabel: "behavioral_profiling",
    blockability: "observable_only",
    status: "active",
    confidence: "probable",
    evidenceTier: "observed",
    evidence: [`The page created a ${algorithm} digest from ${inputBytes} input bytes. The input and digest were not recorded.`],
    details: { algorithm, inputBytes }
  }
}
