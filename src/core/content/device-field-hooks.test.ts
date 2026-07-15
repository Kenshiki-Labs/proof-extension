import { describe, expect, it } from "vitest"

import { installDeviceFieldReadHooks, type DeviceFieldObservation } from "~core/content/device-field-hooks"

// A stub host whose accessor properties are configurable, matching how the
// real Navigator/Screen prototypes expose their getters.
function makeHost(values: Record<string, unknown>): object {
  const host = {}
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(host, key, { configurable: true, enumerable: true, get: () => value })
  }
  return host
}

describe("installDeviceFieldReadHooks", () => {
  it("reports a navigator field read once and returns the real value unchanged", () => {
    const observations: DeviceFieldObservation[] = []
    const navigatorPrototype = makeHost({ hardwareConcurrency: 8, deviceMemory: 8, languages: ["en-US"] })
    installDeviceFieldReadHooks((observation) => observations.push(observation), { navigatorPrototype })

    const first = (navigatorPrototype as { hardwareConcurrency: number }).hardwareConcurrency
    const second = (navigatorPrototype as { hardwareConcurrency: number }).hardwareConcurrency

    expect(first).toBe(8)
    expect(second).toBe(8)
    // Reported once despite two reads.
    expect(observations.filter((o) => o.key === "hardwareConcurrency")).toEqual([
      { key: "hardwareConcurrency", details: { field: "hardwareConcurrency" } }
    ])
  })

  it("reports screen fields and never carries the value", () => {
    const observations: DeviceFieldObservation[] = []
    const screenPrototype = makeHost({ width: 2560, height: 1440, colorDepth: 30 })
    installDeviceFieldReadHooks((observation) => observations.push(observation), { screenPrototype })

    void (screenPrototype as { width: number }).width
    void (screenPrototype as { colorDepth: number }).colorDepth

    const keys = observations.map((o) => o.key)
    expect(keys).toContain("width")
    expect(keys).toContain("colorDepth")
    for (const observation of observations) {
      expect(Object.values(observation.details)).not.toContain(2560)
      expect(Object.values(observation.details)).not.toContain(30)
    }
  })

  it("reports time zone only when the resolvedOptions result's timeZone is read", () => {
    const observations: DeviceFieldObservation[] = []
    const intlDateTimeFormat = {
      prototype: {
        resolvedOptions: () => ({ locale: "en-US", timeZone: "America/New_York" })
      }
    }
    installDeviceFieldReadHooks((observation) => observations.push(observation), { intlDateTimeFormat })

    // Calling resolvedOptions and reading locale must NOT report a timezone read.
    const options = intlDateTimeFormat.prototype.resolvedOptions()
    void options.locale
    expect(observations.some((o) => o.key === "timeZone")).toBe(false)

    // Reading timeZone reports it, and returns the real value.
    expect(options.timeZone).toBe("America/New_York")
    expect(observations.some((o) => o.key === "timeZone")).toBe(true)
  })

  it("leaves a non-configurable field untouched instead of throwing", () => {
    const host = {}
    Object.defineProperty(host, "hardwareConcurrency", { configurable: false, get: () => 4 })
    const observations: DeviceFieldObservation[] = []

    expect(() => installDeviceFieldReadHooks((o) => observations.push(o), { navigatorPrototype: host })).not.toThrow()
    // Reading still works and reports nothing (the getter was not wrapped).
    expect((host as { hardwareConcurrency: number }).hardwareConcurrency).toBe(4)
    expect(observations).toEqual([])
  })

  it("never lets a reporter crash break the page's read", () => {
    const navigatorPrototype = makeHost({ hardwareConcurrency: 8 })
    installDeviceFieldReadHooks(
      () => {
        throw new Error("reporter bug")
      },
      { navigatorPrototype }
    )

    expect(() => (navigatorPrototype as { hardwareConcurrency: number }).hardwareConcurrency).not.toThrow()
    expect((navigatorPrototype as { hardwareConcurrency: number }).hardwareConcurrency).toBe(8)
  })

  it("returns false when no target fields are present", () => {
    expect(
      installDeviceFieldReadHooks(() => undefined, { navigatorPrototype: null, screenPrototype: null, intlDateTimeFormat: null })
    ).toBe(false)
  })
})
