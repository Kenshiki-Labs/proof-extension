// MAIN-world WebRTC observation. A page that constructs an RTCPeerConnection
// can gather ICE candidates that reveal the device's network addresses — the
// public IP and, crucially, private/local-network IPs — without any permission
// prompt and outside the reach of request blocking. This is observe-only: the
// docs already name the IP as a boundary the extension cannot close, so we
// name the capability the moment a page engages it rather than pretending to
// stop it.
//
// Contract, in honesty order:
// - report the raw fact — "a peer connection was constructed" — and nothing
//   about candidates or addresses; the privileged side owns evidence, and a
//   MAIN-world hook must never transmit or log an actual IP
// - report first, inside try/catch — an observation bug must never break the
//   page's own WebRTC call
// - delegate construction unchanged via Reflect.construct so instanceof and
//   the prototype chain are preserved exactly as the page expects
// - the installer takes its target as a parameter (defaulting to the real
//   constructor) so it can be unit-tested against a stub without a browser

export type WebrtcObservation = {
  key: string
  details: Record<string, string | number>
}

export type WebrtcReporter = (observation: WebrtcObservation) => void

type RtcConstructorLike = new (...args: unknown[]) => object

// A page can reach the constructor by either name; both are wrapped so a page
// using the legacy alias is observed the same way.
type RtcGlobalTarget = {
  RTCPeerConnection?: RtcConstructorLike
  webkitRTCPeerConnection?: RtcConstructorLike
}

export function installWebrtcProbeHook(
  report: WebrtcReporter,
  target: RtcGlobalTarget = typeof window !== "undefined" ? (window as unknown as RtcGlobalTarget) : {}
): boolean {
  let wrappedAny = false

  for (const name of ["RTCPeerConnection", "webkitRTCPeerConnection"] as const) {
    const original = target[name]
    if (typeof original !== "function") continue

    // A construct-trap Proxy preserves prototype, instanceof, and static
    // properties for free — the page cannot tell RTCPeerConnection was wrapped
    // from its shape, only that we observed the construction.
    const wrapped = new Proxy(original, {
      construct(ctor, args, newTarget) {
        try {
          report({ key: name, details: { api: name } })
        } catch {
          /* never let observation break the page's WebRTC call */
        }
        return Reflect.construct(ctor, args, newTarget)
      }
    })

    try {
      target[name] = wrapped
      wrappedAny = true
    } catch {
      /* a locked-down global stays as-is; we simply do not observe it */
    }
  }

  return wrappedAny
}
