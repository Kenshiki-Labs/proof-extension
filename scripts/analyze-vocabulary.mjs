import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"

const WRITE = process.argv.includes("--write")
const CHECK = process.argv.includes("--check")
const OUT_PATH = "docs/vocabulary-frequency.json"

const SOURCE_FILES = [
  "src/popup.tsx",
  "src/tabs/report.tsx",
  "src/components/value/ValueLedgerView.tsx",
  "src/core/report/display.ts",
  "src/core/domain/valuation.ts"
]

const CANONICAL_TERMS = [
  "Ad value/yr",
  "Blocked",
  "Blocking changes",
  "Blocking does not change",
  "Cannot block",
  "Copy output",
  "Current tab evidence",
  "Details and evidence",
  "Estimated data value",
  "Evidence",
  "Evidence type",
  "Evidence types",
  "Full report",
  "Local value ledger",
  "Observed tracker presence",
  "Observations",
  "Site tooling/yr",
  "Sites",
  "Still exposed",
  "Stop at source",
  "This period",
  "Trackers",
  "Value ledger",
  "Visits",
  "Watching",
  "Can't block"
]

const DISALLOWED_ALIASES = [
  { phrase: "companies that profit from you", use: "revenue-model trackers" },
  { phrase: "company that profits from you", use: "revenue-model tracker" },
  { phrase: "rolling local value", use: "Local value ledger" },
  { phrase: "sold your data", use: "observed tracker presence" },
  { phrase: "they earned", use: "estimated value represented" },
  { phrase: "what you are worth", use: "Estimated data value" },
  { phrase: "you monetized", use: "Value ledger" },
  { phrase: "your value/yr", use: "Ad value/yr" }
]

const DISALLOWED_SOURCE_PATTERNS = [
  { pattern: /Metric\s+label="Active"/, use: "Metric label=\"Watching\"" },
  { pattern: /Metric\s+label="Cannot"/, use: "Metric label=\"Can't block\"" },
  { pattern: /Metric\s+label="Signals"/, use: "Metric label=\"Evidence types\"" },
  { pattern: />Signal<\/th>|>Signal<\/dt>/, use: "Evidence type" },
  { pattern: /title="Signals\b/, use: "Evidence types" }
]

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "aria",
  "as",
  "button",
  "className",
  "const",
  "div",
  "else",
  "for",
  "from",
  "function",
  "if",
  "import",
  "in",
  "is",
  "it",
  "key",
  "let",
  "null",
  "of",
  "onClick",
  "return",
  "span",
  "the",
  "this",
  "to",
  "true",
  "type",
  "undefined",
  "value",
  "with"
])

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function countPhrase(text, phrase) {
  const normalized = text.toLowerCase()
  const regex = new RegExp(`\\b${escapeRegExp(phrase.toLowerCase()).replaceAll("\\ ", "\\s+")}\\b`, "g")
  return [...normalized.matchAll(regex)].length
}

function extractQuotedText(text) {
  const values = []
  for (const match of text.matchAll(/(["'`])((?:\\.|(?!\1).)*?)\1/gms)) {
    const value = match[2]
    if (!value || /[{};=<>]/.test(value)) continue
    values.push(value)
  }
  return values.join("\n")
}

function wordFrequency(text) {
  const counts = new Map()
  for (const match of text.toLowerCase().matchAll(/[a-z][a-z-]{2,}/g)) {
    const word = match[0]
    if (STOP_WORDS.has(word)) continue
    counts.set(word, (counts.get(word) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 80)
    .map(([word, count]) => ({ word, count }))
}

function analyze() {
  const files = SOURCE_FILES.map((file) => {
    const text = readFileSync(file, "utf8")
    const quotedText = extractQuotedText(text)
    return { file, text, quotedText, sha256: createHash("sha256").update(text).digest("hex") }
  })

  const canonicalTerms = CANONICAL_TERMS.map((term) => ({
    term,
    total: files.reduce((sum, file) => sum + countPhrase(file.text, term), 0),
    files: Object.fromEntries(files.map((file) => [file.file, countPhrase(file.text, term)]).filter(([, count]) => count > 0))
  }))

  const disallowedAliases = DISALLOWED_ALIASES.map((alias) => ({
    ...alias,
    total: files.reduce((sum, file) => sum + countPhrase(file.text, alias.phrase), 0),
    files: Object.fromEntries(files.map((file) => [file.file, countPhrase(file.text, alias.phrase)]).filter(([, count]) => count > 0))
  }))

  const disallowedSourcePatterns = DISALLOWED_SOURCE_PATTERNS.map((item) => ({
    use: item.use,
    pattern: item.pattern.source,
    total: files.reduce((sum, file) => sum + [...file.text.matchAll(new RegExp(item.pattern, "g"))].length, 0),
    files: Object.fromEntries(files.map((file) => [file.file, [...file.text.matchAll(new RegExp(item.pattern, "g"))].length]).filter(([, count]) => count > 0))
  }))

  return {
    schemaVersion: 1,
    sources: files.map(({ file, sha256 }) => ({ file, sha256 })),
    canonicalTerms,
    disallowedAliases,
    disallowedSourcePatterns,
    topWords: wordFrequency(files.map((file) => file.quotedText).join("\n"))
  }
}

const report = analyze()
const serialized = `${JSON.stringify(report, null, 2)}\n`
const disallowedHits = report.disallowedAliases.filter((alias) => alias.total > 0)
const disallowedPatternHits = report.disallowedSourcePatterns.filter((item) => item.total > 0)

if (WRITE) {
  writeFileSync(OUT_PATH, serialized)
  console.log(`Wrote ${OUT_PATH}`)
}

if (disallowedHits.length > 0) {
  console.error("Disallowed vocabulary aliases found:")
  for (const alias of disallowedHits) console.error(`  '${alias.phrase}' -> use '${alias.use}' (${alias.total})`)
  process.exit(1)
}

if (disallowedPatternHits.length > 0) {
  console.error("Disallowed vocabulary label patterns found:")
  for (const item of disallowedPatternHits) console.error(`  /${item.pattern}/ -> use '${item.use}' (${item.total})`)
  process.exit(1)
}

if (CHECK) {
  const current = readFileSync(OUT_PATH, "utf8")
  if (current !== serialized) {
    console.error(`${OUT_PATH} is stale. Run pnpm vocab:analyze.`)
    process.exit(1)
  }
  console.log("Vocabulary contract check passed.")
}

if (!WRITE && !CHECK) console.log(serialized)