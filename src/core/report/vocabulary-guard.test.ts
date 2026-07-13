import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

// docs/surface-contract.md vocabulary rule: product surfaces speak the
// user's language (watcher, blocked, can't be blocked, not yet classified,
// category names); pipeline vocabulary is debug-only. This guard makes the
// rule executable instead of aspirational.
//
// Scope choices, deliberately:
// - The popup (glance surface) is held to full strictness across every
//   string literal — ten seconds of attention leaves no room for our
//   internal ontology. Protocol strings (message types, storage keys) do
//   not contain these words today; if one ever must, exempt it here by
//   name, on purpose, with a comment.
// - The report is checked at its act titles and for whole sections that
//   must not exist there (Diagnostics, Runtime details). Its auditors'
//   appendix is exempt: content explicitly addressed to auditors may use
//   pipeline vocabulary (contract §Shared vocabulary).
// - components/debug/** is never scanned — that is the one surface where
//   pipeline vocabulary belongs.

const BANNED_ON_PRODUCT_SURFACES = [
  /\bobservations?\b/i,
  /\bevents?\b/i,
  /\bsignals?\b/i,
  /\bsource-backed\b/i,
  /\bevidence tiers?\b/i,
  /\bexposure scans?\b/i,
  /\bdiagnostics?\b/i,
  /\bpersistence\b/i
]

const root = resolve(__dirname, "../../..")

function stringLiterals(source: string): string[] {
  // String and template literals only — identifiers like summary.events or
  // imported symbol names are code, not user-facing vocabulary.
  return [...source.matchAll(/"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|`([^`\\]|\\.)*`/g)].map((match) => match[0])
}

describe("surface vocabulary guard", () => {
  it("keeps pipeline vocabulary out of every popup string", () => {
    const popup = readFileSync(resolve(root, "src/popup.tsx"), "utf8")
    const offending = stringLiterals(popup).filter((literal) => BANNED_ON_PRODUCT_SURFACES.some((pattern) => pattern.test(literal)))
    expect(offending, `popup.tsx renders pipeline vocabulary: ${offending.join(" | ")}`).toEqual([])
  })

  it("keeps the report's act titles in user language and its debug sections gone", () => {
    // The act titles have lived in src/tabs/report.tsx and (post component
    // extraction) src/components/report/EvidenceView.tsx — scan both so the
    // guard follows the vocabulary, not the file layout.
    const report = readFileSync(resolve(root, "src/tabs/report.tsx"), "utf8")
    const evidenceViewPath = resolve(root, "src/components/report/EvidenceView.tsx")
    const evidenceView = existsSync(evidenceViewPath) ? readFileSync(evidenceViewPath, "utf8") : ""
    const narrowingPanel = readFileSync(resolve(root, "src/components/NarrowingPanel.tsx"), "utf8")

    const actTitles = [
      ...[...(report + evidenceView).matchAll(/SectionTitle number="0[234]" title="([^"]+)"/g)].map((match) => match[1] ?? ""),
      ...[...narrowingPanel.matchAll(/<h2[^>]*>(?:\{[^}]+\})?0?1 · ([^<]+)<\/h2>/g)].map((match) => match[1] ?? "")
    ]
    expect(actTitles.length).toBeGreaterThanOrEqual(3)
    for (const title of actTitles) {
      for (const pattern of BANNED_ON_PRODUCT_SURFACES) {
        expect(pattern.test(title), `act title "${title}" uses pipeline vocabulary (${pattern})`).toBe(false)
      }
    }

    // Whole sections the contract moved to the debug view.
    expect(report).not.toContain('title="Diagnostics"')
    expect(report).not.toContain("Runtime details")
  })

  it("keeps the debug view as the only surface importing the debug catalog", () => {
    const debug = readFileSync(resolve(root, "src/components/debug/DebugView.tsx"), "utf8")
    const popup = readFileSync(resolve(root, "src/popup.tsx"), "utf8")

    expect(debug).toContain("DEBUG_METRICS")
    expect(popup).not.toContain("DEBUG_METRICS")
  })
})
