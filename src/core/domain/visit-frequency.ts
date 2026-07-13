// Visit-frequency calibration for the value equation.
//
// The tracker DB's annual low/high values are population-average estimates —
// they assume an average person's visit rate. The user knows their actual
// relationship with a site, so we ask once ("How often are you here?") and
// derive a calibrated annual line from the observed per-visit value times
// their own answer: calibrated = thisVisitUsd × visitsPerYear(frequency).
// The population estimate stays visible as the range; the calibrated line is
// labeled as based on the user's answer. Answers are stored per registrable
// domain in UserSettings.siteVisitFrequency.

export type VisitFrequency = "several_daily" | "daily" | "few_weekly" | "weekly" | "rarely" | "once"

export const VISIT_FREQUENCIES: readonly VisitFrequency[] = ["several_daily", "daily", "few_weekly", "weekly", "rarely", "once"]

// Deliberately round, defensible midpoints: ~3.3/day, 1/day, ~3/week, 1/week,
// ~1/month, and a single visit. Estimates, labeled as such in the UI.
export const VISITS_PER_YEAR: Record<VisitFrequency, number> = {
  several_daily: 1200,
  daily: 365,
  few_weekly: 150,
  weekly: 52,
  rarely: 12,
  once: 1
}

export const FREQUENCY_LABELS: Record<VisitFrequency, string> = {
  several_daily: "Several times a day",
  daily: "Daily",
  few_weekly: "A few times a week",
  weekly: "Weekly",
  rarely: "Rarely",
  once: "Just this once"
}

export function isVisitFrequency(value: unknown): value is VisitFrequency {
  return typeof value === "string" && (VISIT_FREQUENCIES as readonly string[]).includes(value)
}

// BANNED BASIS — do not calibrate from perVisit × visitsPerYear. The DB's
// perVisit is "annualARPU ÷ estimated annual signals" (TRACKER_VALUE_SPEC):
// the company's cross-web annual take diluted across every signal a person
// emits everywhere. Multiplying it back by visits to ONE site is structurally
// guaranteed to produce pennies ($0.28/yr for a daily reader of an ad-heavy
// site) no matter how heavily the page monetizes. It is a dilution artifact,
// not a value estimate.
//
// The honest basis is the DB's SOURCED annual low/high range for the
// companies observed on this page — the same figures the verdict banner
// shows for an average person. The user's stated frequency positions them
// within that range: a daily visitor is the heavy end of the audience those
// ARPU-derived estimates describe; a rare visitor is the light end. The
// calibrated figure never leaves the sourced range — frequency selects a
// point inside it, it does not invent a new number.
const RANGE_POSITION: Record<VisitFrequency, number> = {
  several_daily: 1,
  daily: 0.85,
  few_weekly: 0.6,
  weekly: 0.35,
  rarely: 0.1,
  once: 0
}

// Position the user inside the sourced annual range by stated frequency.
// Returns null when there is no sourced range (no revenue-valued trackers
// observed) or for a one-time visit — annual estimates assume a repeat
// audience, and a $low/yr claim for a single visit would overclaim. The UI
// renders those cases as words, not dollars.
export function calibratedAnnualUsd(annualLowUsd: number, annualHighUsd: number, frequency: VisitFrequency): number | null {
  if (!(annualHighUsd > 0) || annualLowUsd < 0 || annualHighUsd < annualLowUsd) return null
  if (frequency === "once") return null
  return annualLowUsd + (annualHighUsd - annualLowUsd) * RANGE_POSITION[frequency]
}
