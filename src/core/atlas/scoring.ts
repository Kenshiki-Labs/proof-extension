import type { FactorScores, Giveup, ScoreResult } from "~core/atlas/types"

// Deterministic Consumer Consent Atlas severity rubric (ported from
// proof/sample/consent-atlas/src/scoring.js). A "giveup" is scored from
// consumer-facing factors (each normalized 0..1); the weighted sum is scaled to
// 0..100. Higher = more alarming to a reasonable consumer.
//
// `actionability_inverse` is derived as (1 - actionability): a giveup that is
// easy to avoid is less alarming, so low actionability raises the score.

export const RUBRIC_VERSION = "atlas-severity-1.0.0"

export const WEIGHTS = {
  surprise: 0.2,
  data_sensitivity: 0.2,
  scope_or_sharing: 0.2,
  irreversibility: 0.15,
  remedy_or_economic: 0.15,
  actionability_inverse: 0.1
} as const

type WeightKey = keyof typeof WEIGHTS

// Optional per-category boost applied AFTER the weighted sum, then clamped to
// 100. Additive points on the 0..100 scale.
export const CATEGORY_BOOSTS: Readonly<Record<string, number>> = {
  biometric_or_sensitive: 8,
  arbitration_class_action_waiver: 6,
  jury_trial_waiver: 4,
  children_data: 8,
  content_license: 3
}

export function clamp01(value: number | undefined): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10
}

// Compute a severity score for one giveup.
export function scoreGiveup(factors: Partial<FactorScores> = {}, category?: string): ScoreResult {
  const f: Record<WeightKey, number> = {
    surprise: clamp01(factors.surprise),
    data_sensitivity: clamp01(factors.data_sensitivity),
    scope_or_sharing: clamp01(factors.scope_or_sharing),
    irreversibility: clamp01(factors.irreversibility),
    remedy_or_economic: clamp01(factors.remedy_or_economic),
    actionability_inverse: clamp01(1 - clamp01(factors.actionability ?? 0.5))
  }
  let weighted = 0
  for (const key of Object.keys(WEIGHTS) as WeightKey[]) weighted += WEIGHTS[key] * f[key]
  const base = round1(weighted * 100)
  const boost = category ? CATEGORY_BOOSTS[category] ?? 0 : 0
  const score = round1(Math.min(100, base + boost))
  return { score, base, boost, per_factor: f }
}

// Sort giveups by score desc (stable tie-break by evidence_confidence then id)
// and return the top N. Mirrors the source `topGiveups`.
export function topN(giveups: Giveup[], n = 3): Giveup[] {
  return [...(giveups ?? [])]
    .sort((a, b) => {
      const ds = (b.scoring?.score ?? 0) - (a.scoring?.score ?? 0)
      if (ds !== 0) return ds
      const dc = (b.evidence_confidence ?? 0) - (a.evidence_confidence ?? 0)
      if (dc !== 0) return dc
      return String(a.id).localeCompare(String(b.id))
    })
    .slice(0, n)
}
