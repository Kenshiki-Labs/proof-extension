import { describe, expect, it } from "vitest"

import {
  calibratedAnnualUsd,
  FREQUENCY_LABELS,
  isVisitFrequency,
  VISIT_FREQUENCIES,
  VISITS_PER_YEAR,
  type VisitFrequency,
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

// Calibration invariants: frequency positions the user INSIDE the sourced
// range — never below low, never above high, monotonically increasing with
// stated frequency, and refusing to claim a yearly figure for a single visit.
describe("calibratedAnnualUsd invariants", () => {
  const ranges: Array<[number, number]> = [
    [0, 1],
    [12, 48],
    [0.05, 0.31],
    [100, 100],
    [3.17, 890.2]
  ]

  it("stays within [low, high] for every frequency and range", () => {
    for (const [low, high] of ranges) {
      for (const frequency of VISIT_FREQUENCIES) {
        const result = calibratedAnnualUsd(low, high, frequency)
        if (frequency === "once") {
          expect(result).toBeNull()
          continue
        }
        expect(result, `${frequency} ${low}-${high}`).not.toBeNull()
        expect(result!).toBeGreaterThanOrEqual(low)
        expect(result!).toBeLessThanOrEqual(high)
      }
    }
  })

  it("is monotonically non-decreasing from rarely to several_daily", () => {
    const ordered: VisitFrequency[] = ["rarely", "weekly", "few_weekly", "daily", "several_daily"]
    for (const [low, high] of ranges) {
      const values = ordered.map((frequency) => calibratedAnnualUsd(low, high, frequency)!)
      for (let index = 1; index < values.length; index += 1) {
        expect(values[index]!, `${ordered[index]} vs ${ordered[index - 1]} on ${low}-${high}`).toBeGreaterThanOrEqual(values[index - 1]!)
      }
    }
  })

  it("hits the exact endpoints: several_daily = high, and the interpolation formula", () => {
    expect(calibratedAnnualUsd(12, 48, "several_daily")).toBe(48)
    expect(calibratedAnnualUsd(12, 48, "daily")).toBeCloseTo(12 + 36 * 0.85, 10)
    expect(calibratedAnnualUsd(12, 48, "rarely")).toBeCloseTo(12 + 36 * 0.1, 10)
  })

  it("returns null when there is no positive sourced range or the range is inverted", () => {
    expect(calibratedAnnualUsd(0, 0, "daily")).toBeNull()
    expect(calibratedAnnualUsd(50, 20, "daily")).toBeNull()
    expect(calibratedAnnualUsd(-1, 10, "daily")).toBeNull()
  })
})
