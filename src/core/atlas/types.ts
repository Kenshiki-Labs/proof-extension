import * as z from "zod"

import { DETECTION_RULES, DOC_TYPES, PATTERN_FAMILIES } from "~core/atlas/rules"

// Document types the crawler tries to discover. Derived from the DOC_TYPES
// const so the union can never drift from the value table.
export type DocType = (typeof DOC_TYPES)[keyof typeof DOC_TYPES]

export const DocTypeSchema = z.enum(Object.values(DOC_TYPES) as [DocType, ...DocType[]])

// Pattern families. Derived from the PATTERN_FAMILIES const.
export type PatternFamily = (typeof PATTERN_FAMILIES)[keyof typeof PATTERN_FAMILIES]

export const PatternFamilySchema = z.enum(Object.values(PATTERN_FAMILIES) as [PatternFamily, ...PatternFamily[]])

// Giveup category union — DERIVED from the rule set, not a hand-maintained
// list. Every rule.category is a member by construction, so adding a rule
// automatically widens this union and cannot leave a stale entry behind.
export type GiveupCategory = (typeof DETECTION_RULES)[number]["category"]

const GIVEUP_CATEGORY_VALUES = Array.from(new Set(DETECTION_RULES.map((rule) => rule.category))) as [
  GiveupCategory,
  ...GiveupCategory[]
]

export const GiveupCategorySchema = z.enum(GIVEUP_CATEGORY_VALUES)

// Consumer-facing severity factors (each normalized 0..1) attached to a rule.
export type FactorScores = {
  surprise: number
  data_sensitivity: number
  scope_or_sharing: number
  irreversibility: number
  remedy_or_economic: number
  actionability: number
}

// A single detection rule. `category`/`family` are kept as broad `string`
// here on purpose: the literal narrowing (and thus GiveupCategory) comes from
// the `as const` rule table in rules.ts, and typing them as the derived unions
// here would create a circular type dependency with GiveupCategory.
export type DetectionRule = {
  id_base: string
  category: string
  family: string
  short_label: string
  plain_english_summary: string
  why_it_matters: string
  applies_to: readonly DocType[]
  evidence_phrases: readonly string[]
  pattern: RegExp
  suggested_mitigation: string
  factors: FactorScores
}

// Per-factor breakdown produced by scoreGiveup. `actionability` is replaced by
// its inverse (1 - actionability) because low actionability raises severity.
export type PerFactor = {
  surprise: number
  data_sensitivity: number
  scope_or_sharing: number
  irreversibility: number
  remedy_or_economic: number
  actionability_inverse: number
}

export type ScoreResult = {
  score: number
  base: number
  boost: number
  per_factor: PerFactor
}

export const PerFactorSchema = z.object({
  surprise: z.number(),
  data_sensitivity: z.number(),
  scope_or_sharing: z.number(),
  irreversibility: z.number(),
  remedy_or_economic: z.number(),
  actionability_inverse: z.number()
})

export const GiveupScoringSchema = z.object({
  rubric_version: z.string(),
  score: z.number(),
  base: z.number(),
  boost: z.number(),
  per_factor: PerFactorSchema
})

// Input record for a single fetched/extracted document. `__text` holds the
// readable text; `final_url`/`url` provide provenance for the finding.
export type DocumentText = {
  url?: string
  final_url?: string
  __text?: string
}

export const DocumentTextSchema = z.object({
  url: z.string().optional(),
  final_url: z.string().optional(),
  __text: z.string().optional()
})

// One detected consumer "giveup" — the record shape detectGiveups emits.
export const GiveupSchema = z.object({
  id: z.string(),
  pattern_id: z.string(),
  ontology_version: z.string(),
  category: GiveupCategorySchema,
  family: PatternFamilySchema,
  short_label: z.string(),
  plain_english_summary: z.string(),
  why_it_matters: z.string(),
  source_document: DocTypeSchema,
  source_url: z.string().nullable(),
  source_quote: z.string(),
  evidence_confidence: z.number(),
  evidence_phrases: z.array(z.string()),
  actionability: z.number(),
  suggested_mitigation: z.string(),
  scoring: GiveupScoringSchema
})

export type Giveup = z.infer<typeof GiveupSchema>

// A built document extraction record (buildDocument output).
export type DocumentRecord = {
  url: string
  final_url: string
  title: string | null
  last_updated: string | null
  text_hash: string
  text_length: number
  thin_content: boolean
  excerpts: string[]
}
