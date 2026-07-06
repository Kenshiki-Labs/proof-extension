import { describe, expect, it } from "vitest"

import {
  calibratedAnnualUsd,
  FREQUENCY_LABELS,
  isVisitFrequency,
  VISIT_FREQUENCIES,
  VISITS_PER_YEAR,
} from "~core/domain/visit-frequency"

describe("visit frequency", () => {
  it("every frequency has a visits-per-year value and a label", () => {
    for (const frequency of VISIT_FREQUENCIES) {
      expect(VISITS_PER_YEAR[frequency]).toBeGreaterThan(0)
      expect(FREQUENCY_LABELS[frequency].length).toBeGreaterThan(0)
    }
  })

  it("rates order from most to least frequent, ending at a single visit", () => {
    const rates = VISIT_FREQUENCIES.map((frequency) => VISITS_PER_YEAR[frequency])
    expect([...rates].sort((a, b) => b - a)).toEqual(rates)
    expect(rates.at(-1)).toBe(1)
  })

  it("calibrates annual value as per-visit × stated rate", () => {
    expect(calibratedAnnualUsd(0.02, "daily")).toBeCloseTo(7.3)
    expect(calibratedAnnualUsd(0.02, "once")).toBeCloseTo(0.02)
  })

  it("refuses to fabricate an annual value from no per-visit value", () => {
    expect(calibratedAnnualUsd(0, "daily")).toBeNull()
    expect(calibratedAnnualUsd(Number.NaN, "daily")).toBeNull()
  })

  it("guards unknown values", () => {
    expect(isVisitFrequency("daily")).toBe(true)
    expect(isVisitFrequency("sometimes")).toBe(false)
    expect(isVisitFrequency(3)).toBe(false)
  })
})
