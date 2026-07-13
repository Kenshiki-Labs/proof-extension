import { describe, expect, it } from "vitest"

import { buildNarrowing, type IdentityReading } from "~core/domain/identity-entropy"
import { joinTraits, portraitCloser, portraitTraits } from "~core/report/portrait"

function stepsFor(readings: IdentityReading[]) {
  return buildNarrowing(readings).steps
}

describe("portraitTraits", () => {
  it("phrases the full trait set as an introduction, in canonical narrowing order", () => {
    const steps = stepsFor([
      { key: "gpu", detail: "ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)" },
      { key: "timezone", detail: "America/Los_Angeles" },
      { key: "screen", detail: "2560x1440 @2x" },
      { key: "platformLanguage", detail: "MacIntel · en-US" },
      { key: "canvas", detail: "a1b2c3" },
      { key: "audio", detail: "d4e5f6" },
      { key: "fonts", detail: "22 of 30 probed" }
    ])

    expect(portraitTraits(steps)).toEqual([
      "live on US Pacific time",
      "look at a 2560x1440 screen at 2× density",
      "use a Mac set to English (US)",
      "draw with an Apple GPU",
      "leave a canvas signature few others share",
      "carry an audio signature of your own",
      "have 22 of 30 common fonts installed"
    ])
  })

  it("keeps fractional pixel densities readable", () => {
    expect(portraitTraits(stepsFor([{ key: "screen", detail: "2560x1440 @2.2x" }]))).toEqual([
      "look at a 2560x1440 screen at 2.2× density"
    ])
  })

  it("never renders a timezone as a city: unmapped zones keep their IANA id", () => {
    expect(portraitTraits(stepsFor([{ key: "timezone", detail: "Europe/Berlin" }]))).toEqual([
      "live in the Europe/Berlin time zone"
    ])
  })

  it("falls back to honest generic phrasing when details do not parse", () => {
    const steps = stepsFor([
      { key: "screen", detail: "unusual-screen" },
      { key: "gpu", detail: "Custom Renderer 9000" },
      { key: "fonts", detail: "many fonts" },
      { key: "platformLanguage", detail: "PlayStation 5" }
    ])

    expect(portraitTraits(steps)).toEqual([
      "look at a unusual-screen screen",
      "use a PlayStation 5 device",
      "draw with a graphics stack that names itself",
      "have a recognizable set of fonts installed"
    ])
  })

  it("handles a language-only platformLanguage reading", () => {
    expect(portraitTraits(stepsFor([{ key: "platformLanguage", detail: "en-GB" }]))).toEqual([
      "browse in English (GB)"
    ])
  })
})

describe("joinTraits", () => {
  it("joins with commas and a final 'and'", () => {
    expect(joinTraits(["a", "b", "c"])).toBe("a, b, and c")
    expect(joinTraits(["a"])).toBe("a")
    expect(joinTraits([])).toBe("")
  })
})

describe("portraitCloser", () => {
  it("only claims 'it's you' when the model fits almost nobody else", () => {
    expect(portraitCloser(1.3)).toBe("That isn't a demographic. It's you.")
    expect(portraitCloser(9.9)).toBe("That isn't a demographic. It's you.")
    expect(portraitCloser(4_000)).toContain("small town")
    expect(portraitCloser(2_000_000)).toContain("still a crowd")
  })
})
