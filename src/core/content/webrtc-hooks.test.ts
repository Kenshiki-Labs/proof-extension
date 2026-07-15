import { describe, expect, it } from "vitest"

import { installWebrtcProbeHook, type WebrtcObservation } from "~core/content/webrtc-hooks"

class StubPeerConnection {
  public readonly args: unknown[]
  constructor(...args: unknown[]) {
    this.args = args
  }
}

function makeTarget() {
  return { RTCPeerConnection: StubPeerConnection as unknown as new (...args: unknown[]) => object }
}

describe("installWebrtcProbeHook", () => {
  it("reports each construction and still returns a real peer connection", () => {
    const observations: WebrtcObservation[] = []
    const target = makeTarget()
    expect(installWebrtcProbeHook((observation) => observations.push(observation), target)).toBe(true)

    const Ctor = target.RTCPeerConnection
    const connection = new Ctor({ iceServers: [] })

    expect(connection).toBeInstanceOf(StubPeerConnection)
    expect((connection as StubPeerConnection).args).toEqual([{ iceServers: [] }])
    expect(observations).toEqual([{ key: "RTCPeerConnection", details: { api: "RTCPeerConnection" } }])
  })

  it("preserves instanceof against the original constructor", () => {
    const target = makeTarget()
    installWebrtcProbeHook(() => undefined, target)
    const connection = new target.RTCPeerConnection()
    // The wrapper is a construct-trap Proxy, so instanceof still resolves.
    expect(connection instanceof StubPeerConnection).toBe(true)
  })

  it("never lets a reporter crash break the page's WebRTC call", () => {
    const target = makeTarget()
    installWebrtcProbeHook(() => {
      throw new Error("reporter bug")
    }, target)

    expect(() => new target.RTCPeerConnection()).not.toThrow()
  })

  it("wraps the webkit-prefixed constructor too", () => {
    const observations: WebrtcObservation[] = []
    const target = {
      webkitRTCPeerConnection: StubPeerConnection as unknown as new (...args: unknown[]) => object
    }
    installWebrtcProbeHook((observation) => observations.push(observation), target)
    new target.webkitRTCPeerConnection()
    expect(observations[0]).toEqual({ key: "webkitRTCPeerConnection", details: { api: "webkitRTCPeerConnection" } })
  })

  it("returns false when no WebRTC constructor is present", () => {
    expect(installWebrtcProbeHook(() => undefined, {})).toBe(false)
  })
})
