import { afterEach, describe, expect, it, vi } from "vitest"

import { collectBrowserSurfaceExposure } from "./browser-surface"

function stubMatchMedia(matches: { dark?: boolean; reducedMotion?: boolean } = {}) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("prefers-color-scheme") ? Boolean(matches.dark) : Boolean(matches.reducedMotion),
      media: query
    }))
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("collectBrowserSurfaceExposure", () => {
  it("returns one passive exposure-scan event labeled as fingerprinting surface", () => {
    stubMatchMedia()

    const events = collectBrowserSurfaceExposure("https://example.test")

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      id: "browser_surface:https://example.test:passive",
      origin: "https://example.test",
      source: "extension-scan",
      firstParty: true,
      policyLabel: "fingerprinting",
      eventType: "browser_surface",
      blockability: "observable_only",
      status: "active",
      confidence: "confirmed"
    })
    expect(events[0]?.evidence).toContain(
      "This is an extension-run exposure scan; it does not prove the current page queried these fields."
    )
  })

  it("captures browser surface fields without reading page content", () => {
    stubMatchMedia({ dark: true, reducedMotion: true })

    const [event] = collectBrowserSurfaceExposure("https://example.test")
    const details = event?.details ?? {}

    expect(details.viewport).toMatch(/^\d+x\d+$/)
    expect(details.screen).toMatch(/^\d+x\d+$/)
    expect(details.colorScheme).toBe("dark")
    expect(details.reducedMotion).toBe("reduce")
    expect(details.webdriver).toBe("false")
    expect(details.cookieEnabled).toBe("true")
    expect(details.timezone).toBeTruthy()
    expect(details.language).toBeTruthy()
    expect(Object.keys(details)).toEqual(
      expect.arrayContaining(["platform", "languages", "pixelRatio", "orientation", "cores", "touchPoints", "doNotTrack"])
    )
  })

  it("reports network hints as unavailable when the connection API is absent", () => {
    stubMatchMedia()

    const [event] = collectBrowserSurfaceExposure("https://example.test")
    const details = event?.details ?? {}

    expect(details.networkType).toBe("unavailable")
    expect(details.downlink).toBe("unavailable")
    expect(details.rtt).toBe("unavailable")
    expect(details.saveData).toBe("unavailable")
  })

  it("reads the GPU renderer when WebGL exposes it, naming the hardware", () => {
    stubMatchMedia()
    // Real, unmasked WebGL: getExtension returns the debug info, getParameter
    // returns the hardware string — the alarming, unconsented, unblockable read.
    const gl = {
      getExtension: (name: string) => (name === "WEBGL_debug_renderer_info" ? { UNMASKED_RENDERER_WEBGL: 37446 } : null),
      getParameter: (param: number) => (param === 37446 ? "ANGLE (Apple, Apple M2 Pro, OpenGL 4.1)" : "")
    }
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(gl as unknown as RenderingContext)

    const [event] = collectBrowserSurfaceExposure("https://example.test")
    expect(event?.details?.gpuRenderer).toBe("ANGLE (Apple, Apple M2 Pro, OpenGL 4.1)")
    expect(event?.details?.gpuMasked).toBe("false")
    expect(event?.evidence.some((line) => line.includes("Apple M2 Pro"))).toBe(true)
  })

  it("treats a software/blocked renderer as masked — a defense finding, not a value", () => {
    stubMatchMedia()
    const gl = {
      getExtension: (name: string) => (name === "WEBGL_debug_renderer_info" ? { UNMASKED_RENDERER_WEBGL: 37446 } : null),
      getParameter: () => "Google SwiftShader"
    }
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(gl as unknown as RenderingContext)

    const [event] = collectBrowserSurfaceExposure("https://example.test")
    // Masked value is withheld from the narrowing (reported unavailable) but
    // the defense itself is recorded.
    expect(event?.details?.gpuRenderer).toBe("unavailable")
    expect(event?.details?.gpuMasked).toBe("true")
    expect(event?.evidence.some((line) => line.includes("hid your GPU"))).toBe(true)
  })

  it("never transmits — the read constructs no request", () => {
    stubMatchMedia()
    const fetchSpy = vi.fn()
    const beaconSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)
    vi.stubGlobal("navigator", { ...navigator, sendBeacon: beaconSpy })

    collectBrowserSurfaceExposure("https://example.test")

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(beaconSpy).not.toHaveBeenCalled()
  })
})
