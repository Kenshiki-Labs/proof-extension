import { describe, expect, it } from "vitest"

import { buildNarrowing, formatCandidates, IDENTITY_SIGNALS, POPULATION_BASE, type IdentityReading } from "./identity-entropy"

// LOCKSTEP CONTRACT with proof/src/lib/entropyModel.js. These are the
// canonical per-signal bit values and sources; if the proof app's model
// changes, this table must be updated in the same change (and both products
// re-reviewed). Keeping it as an explicit fixture — rather than a cross-repo
// import — is deliberate: the extension repo must build without the proof
// checkout present, and a silent drift is caught here as a failing test.
const PROOF_MODEL = [
  { key: "timezone", bits: 3.04, source: "measured" },
  { key: "screen", bits: 4.83, source: "measured" },
  { key: "platformLanguage", bits: 2.1, source: "estimated" },
  { key: "gpu", bits: 7, source: "estimated" },
  { key: "canvas", bits: 5, source: "estimated" },
  { key: "audio", bits: 3, source: "estimated" },
  { key: "fonts", bits: 6, source: "estimated" }
]

describe("identity-entropy — lockstep with the proof app's entropyModel", () => {
  it("matches proof's signal set, bit values, and measured/estimated sources exactly", () => {
    expect(IDENTITY_SIGNALS.map((signal) => ({ key: signal.key, bits: signal.bits, source: signal.source }))).toEqual(PROOF_MODEL)
  })

  it("uses the U.S. population base", () => {
    expect(POPULATION_BASE).toBe(330_000_000)
  })
})

describe("buildNarrowing", () => {
  it("folds readings in canonical order and halves the pool per bit", () => {
    const readings: IdentityReading[] = [
      { key: "gpu", detail: "Apple M2 Pro" },
      { key: "timezone", detail: "America/Denver" },
      { key: "screen", detail: "1512x982 @2x" }
    ]
    const { steps, cumulativeBits, remaining } = buildNarrowing(readings)

    // Canonical order, not read order: timezone, screen, then gpu.
    expect(steps.map((step) => step.key)).toEqual(["timezone", "screen", "gpu"])
    expect(cumulativeBits).toBeCloseTo(3.04 + 4.83 + 7, 5)
    expect(remaining).toBeCloseTo(POPULATION_BASE / 2 ** (3.04 + 4.83 + 7), 3)
    expect(steps[0]?.detail).toBe("America/Denver")
    expect(steps[2]?.tier).toBe("probe")
  })

  it("carries each signal's own value and running remainder", () => {
    const { steps } = buildNarrowing([{ key: "timezone", detail: "America/Denver" }])
    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({ key: "timezone", bits: 3.04, detail: "America/Denver" })
    expect(steps[0]?.remaining).toBeCloseTo(POPULATION_BASE / 2 ** 3.04, 2)
  })

  it("returns the full population and no steps when nothing readable", () => {
    const { steps, remaining, cumulativeBits } = buildNarrowing([])
    expect(steps).toEqual([])
    expect(cumulativeBits).toBe(0)
    expect(remaining).toBe(POPULATION_BASE)
  })
})

describe("formatCandidates", () => {
  it("formats the collapsing pool the way the narrowing displays it", () => {
    expect(formatCandidates(40_100_000)).toBe("40,100,000")
    expect(formatCandidates(160)).toBe("160.0") // lockstep: proof's toFixed(1) for value >= 1
    expect(formatCandidates(4.2)).toBe("4.2")
    expect(formatCandidates(0.3)).toBe("0.30")
    expect(formatCandidates(0.01)).toBe("< 1 — unique in this model")
  })
})
