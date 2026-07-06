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

export const VISIT_FREQUENCIES: readonly VisitFrequency[] = [
  "several_daily",
  "daily",
  "few_weekly",
  "weekly",
  "rarely",
  "once",
]

// Deliberately round, defensible midpoints: ~3.3/day, 1/day, ~3/week, 1/week,
// ~1/month, and a single visit. Estimates, labeled as such in the UI.
export const VISITS_PER_YEAR: Record<VisitFrequency, number> = {
  several_daily: 1200,
  daily: 365,
  few_weekly: 150,
  weekly: 52,
  rarely: 12,
  once: 1,
}

export const FREQUENCY_LABELS: Record<VisitFrequency, string> = {
  several_daily: "Several times a day",
  daily: "Daily",
  few_weekly: "A few times a week",
  weekly: "Weekly",
  rarely: "Rarely",
  once: "Just this once",
}

export function isVisitFrequency(value: unknown): value is VisitFrequency {
  return typeof value === "string" && (VISIT_FREQUENCIES as readonly string[]).includes(value)
}

// The calibrated annual line: observed per-visit value × the user's own visit
// rate. Returns null when there is no per-visit value to scale (no valued
// trackers observed) — the UI must not render a $0/yr claim from no data.
export function calibratedAnnualUsd(thisVisitUsd: number, frequency: VisitFrequency): number | null {
  if (!(thisVisitUsd > 0)) return null
  return thisVisitUsd * VISITS_PER_YEAR[frequency]
}
