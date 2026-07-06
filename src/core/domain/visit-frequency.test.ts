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

  it("positions the user inside the sourced annual range by frequency", () => {
    // range $10–$50: daily = heavy end, weekly = light-middle, never outside.
    expect(calibratedAnnualUsd(10, 50, "several_daily")).toBe(50)
    expect(calibratedAnnualUsd(10, 50, "daily")).toBeCloseTo(44)
    expect(calibratedAnnualUsd(10, 50, "weekly")).toBeCloseTo(24)
    expect(calibratedAnnualUsd(10, 50, "rarely")).toBeCloseTo(14)
  })

  it("never leaves the sourced range", () => {
    for (const frequency of VISIT_FREQUENCIES) {
      const value = calibratedAnnualUsd(10, 50, frequency)
      if (value !== null) {
        expect(value).toBeGreaterThanOrEqual(10)
        expect(value).toBeLessThanOrEqual(50)
      }
    }
  })

  it("claims no yearly figure for a one-time visit — annual estimates assume a repeat audience", () => {
    expect(calibratedAnnualUsd(10, 50, "once")).toBeNull()
  })

  it("refuses to fabricate a figure from no sourced range", () => {
    expect(calibratedAnnualUsd(0, 0, "daily")).toBeNull()
    expect(calibratedAnnualUsd(0, Number.NaN, "daily")).toBeNull()
    expect(calibratedAnnualUsd(50, 10, "daily")).toBeNull()
  })

  it("guards unknown values", () => {
    expect(isVisitFrequency("daily")).toBe(true)
    expect(isVisitFrequency("sometimes")).toBe(false)
    expect(isVisitFrequency(3)).toBe(false)
  })
})
