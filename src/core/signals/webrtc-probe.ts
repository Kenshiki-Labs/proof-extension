import type { ObserverEvent } from "~core/domain/types"

// webrtc_probe events arrive over the page channel from the MAIN world, where
// any script can post them — so like the other api-hook normalizers, this
// rebuilds the evidence deterministically from sanitized metadata and never
// stores page-authored prose. The observation is deliberately narrow: it
// records that a peer connection was constructed, which is what can expose the
// device's network (IP) addresses. It never carries an actual address — the
// hook does not read candidates, and this normalizer would drop them anyway.
//
// This is observable_only by nature: WebRTC address exposure happens in the
// browser's ICE machinery, below the reach of request blocking, and the docs
// already name the IP as a boundary the extension cannot close. Naming it is
// the honest move; claiming to stop it would not be.

const WEBRTC_APIS = new Set(["RTCPeerConnection", "webkitRTCPeerConnection"])

export function normalizeWebrtcProbeEvent(event: ObserverEvent): ObserverEvent {
  if (event.eventType !== "webrtc_probe") return event

  const rawApi = typeof event.details?.api === "string" ? event.details.api : ""
  const api = WEBRTC_APIS.has(rawApi) ? rawApi : "RTCPeerConnection"

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
    evidence: [
      "The page set up a WebRTC connection, which can reveal your device's network (IP) addresses — including private addresses on your local network. No address was read or recorded."
    ],
    details: { api }
  }
}
