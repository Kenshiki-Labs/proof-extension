// Ported, in lockstep, from the proof app's src/lib/entropyModel.js. The two
// products share one arithmetic: the site demonstrates the narrowing once,
// the extension runs the identical narrowing on every page. identity-entropy.test.ts
// pins the per-signal bit values against that source — if proof's model
// changes, this must change with it (and the test fails until it does).
//
// This is a SIMPLIFIED, EXPLICITLY-ESTIMATED additive model, not a rigorous
// joint-entropy measurement. Two honesty caveats carried verbatim from proof:
//   1. Summing per-signal bits assumes independence. GPU, canvas, and audio
//      fingerprints correlate (a Mac reports a Mac GPU and a Mac-flavored
//      canvas), so true joint entropy is somewhat lower than the naive sum.
//   2. Timezone and screen bits are close to EFF Panopticlick (2010) measured
//      values; GPU, canvas, audio, and font bits are this project's own
//      conservative estimates — no current census-scale study of those
//      specific signals exists — and are marked "estimated" in the UI.
//
// POPULATION_BASE is the U.S. population (~330M), the figure used in
// re-identification writing (e.g. Sweeney's k-anonymity work).

export const POPULATION_BASE = 330_000_000

export type IdentitySignalKey = "timezone" | "screen" | "platformLanguage" | "gpu" | "canvas" | "audio" | "fonts"

export type IdentityBitSource = "measured" | "estimated"

// tier is an extension-only presentation split (passive = unblockable +
// unconsented, no probe; probe = active read, unconsented, but defended by
// hardened browsers). It is NOT part of the proof lockstep — only key, bits,
// and source are.
export type IdentityTier = "passive" | "probe"

export type IdentitySignalDef = {
  key: IdentitySignalKey
  label: string
  bits: number
  source: IdentityBitSource
  sourceNote: string
  tier: IdentityTier
}

export const IDENTITY_SIGNALS: readonly IdentitySignalDef[] = [
  { key: "timezone", label: "Timezone", bits: 3.04, source: "measured", sourceNote: "EFF Panopticlick, 2010", tier: "passive" },
  { key: "screen", label: "Screen + pixel ratio", bits: 4.83, source: "measured", sourceNote: "EFF Panopticlick, 2010", tier: "passive" },
  {
    key: "platformLanguage",
    label: "Platform + language",
    bits: 2.1,
    source: "estimated",
    sourceNote: "conservative estimate",
    tier: "passive"
  },
  { key: "gpu", label: "GPU renderer", bits: 7, source: "estimated", sourceNote: "conservative estimate", tier: "probe" },
  { key: "canvas", label: "Canvas render hash", bits: 5, source: "estimated", sourceNote: "conservative estimate", tier: "probe" },
  { key: "audio", label: "Audio-stack fingerprint", bits: 3, source: "estimated", sourceNote: "conservative estimate", tier: "probe" },
  { key: "fonts", label: "Installed font list", bits: 6, source: "estimated", sourceNote: "conservative estimate", tier: "probe" }
] as const

const SIGNAL_BY_KEY = new Map(IDENTITY_SIGNALS.map((signal) => [signal.key, signal]))

// One present, readable signal and the user's own value for it. A masked or
// refused surface (SwiftShader GPU, randomized canvas) is NOT a reading — it
// is dropped from the narrowing and surfaced separately as a defense finding.
export type IdentityReading = { key: IdentitySignalKey; detail: string }

export type NarrowingStep = IdentitySignalDef & {
  detail: string
  cumulativeBits: number
  remaining: number
}

function candidatesRemaining(cumulativeBits: number): number {
  return POPULATION_BASE / 2 ** cumulativeBits
}

// Readings are folded in the canonical IDENTITY_SIGNALS order (roughly
// passive-arrival first), not the order they were read, so the narrowing
// always reads the same for the same device.
export function buildNarrowing(readings: readonly IdentityReading[]): {
  steps: NarrowingStep[]
  cumulativeBits: number
  remaining: number
} {
  const detailByKey = new Map(readings.map((reading) => [reading.key, reading.detail]))
  let cumulativeBits = 0
  const steps: NarrowingStep[] = []

  for (const signal of IDENTITY_SIGNALS) {
    const detail = detailByKey.get(signal.key)
    if (detail === undefined) continue
    cumulativeBits += signal.bits
    steps.push({ ...signal, detail, cumulativeBits, remaining: candidatesRemaining(cumulativeBits) })
  }

  return {
    steps,
    cumulativeBits,
    remaining: steps.at(-1)?.remaining ?? POPULATION_BASE
  }
}

export function identitySignal(key: IdentitySignalKey): IdentitySignalDef | undefined {
  return SIGNAL_BY_KEY.get(key)
}

export function formatCandidates(value: number): string {
  if (value >= 1000) return Math.round(value).toLocaleString("en-US")
  if (value >= 1) return value.toFixed(1)
  return value < 0.05 ? "< 1 — unique in this model" : value.toFixed(2)
}
