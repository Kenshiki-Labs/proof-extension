import { DETECTION_RULES, ONTOLOGY_VERSION } from "~core/atlas/rules"
import { RUBRIC_VERSION, scoreGiveup } from "~core/atlas/scoring"
import type { DocType, DocumentText, Giveup, GiveupCategory, PatternFamily } from "~core/atlas/types"

// Rule-based clause detector (v1), ported faithfully from
// proof/sample/consent-atlas/src/giveupRules.js (detectGiveups). Each rule
// pairs a regex over readable document text with pre-set severity factors and
// consumer-facing metadata. Deterministic and testable.

// Grab a short quote around the first match for evidence.
function quoteAround(text: string, match: RegExpExecArray, pad = 140): string {
  const matched = match[0] ?? ""
  const start = Math.max(0, match.index - pad)
  const end = Math.min(text.length, match.index + matched.length + pad)
  let q = text.slice(start, end).replace(/\s+/g, " ").trim()
  if (start > 0) q = "…" + q
  if (end < text.length) q = q + "…"
  return q
}

// Detect giveups across a set of extracted documents. `documents` is a map of
// docType -> document record; each must include raw readable text under
// `__text`. Returns consumer_giveup records (with `.scoring`).
export function detectGiveups(documents: Partial<Record<DocType, DocumentText>>): Giveup[] {
  const out: Giveup[] = []
  let seq = 0
  for (const rule of DETECTION_RULES) {
    for (const docType of rule.applies_to) {
      const doc = documents[docType]
      const text = doc?.__text
      if (!doc || !text) continue
      const flags = rule.pattern.flags.includes("g") ? rule.pattern.flags : rule.pattern.flags + "g"
      const re = new RegExp(rule.pattern.source, flags)
      const match = re.exec(text)
      if (!match) continue
      // Count matches for confidence (more mentions => higher confidence).
      let count = 1
      while (re.exec(text)) count++
      const evidence_confidence = Math.min(1, 0.55 + 0.15 * (count - 1))
      const scoring = scoreGiveup(rule.factors, rule.category)
      out.push({
        id: `${rule.id_base}#${++seq}`,
        pattern_id: rule.id_base,
        ontology_version: ONTOLOGY_VERSION,
        category: rule.category as GiveupCategory,
        family: rule.family as PatternFamily,
        short_label: rule.short_label,
        plain_english_summary: rule.plain_english_summary,
        why_it_matters: rule.why_it_matters,
        source_document: docType,
        source_url: doc.final_url || doc.url || null,
        source_quote: quoteAround(text, match),
        evidence_confidence: Number(evidence_confidence.toFixed(2)),
        evidence_phrases: [...rule.evidence_phrases],
        actionability: rule.factors.actionability,
        suggested_mitigation: rule.suggested_mitigation,
        scoring: { rubric_version: RUBRIC_VERSION, ...scoring }
      })
      break // one finding per rule (first doc type that matches)
    }
  }
  return out
}
