import { readFileSync, readdirSync, statSync } from "node:fs"
import { extname, join } from "node:path"

const CODE_EXTENSIONS = new Set([".css", ".js", ".jsx", ".ts", ".tsx"])
const TOKEN_FILES = new Set(["src/style.css", "src/components/system/tokens.ts"])
// Colors passed to browser/canvas APIs that REQUIRE a literal value, not UI
// styling: the canvas-fingerprint probe draws specific colors to a <canvas>
// to produce a stable device hash, and the Chrome action badge API
// (setBadgeBackgroundColor) takes a literal color string. The raw-color ban
// is a UI-styling guardrail and does not apply to these. Only the raw-color
// check is skipped for these files; inline-style and font-size checks still run.
const CANVAS_COLOR_FILES = new Set(["src/core/signals/browser-surface.ts", "src/background.ts"])
// Content scripts that inject styled DOM into arbitrary third-party pages
// cannot reach the extension's tokens (Tailwind/style.css live in the
// extension's own surfaces, not the host page) — literal colors and inline
// styles are the only option. Same carve-out as the canvas/badge files.
const PAGE_INJECTED_FILES = new Set(["src/contents/blocked-space-marker.ts"])
const IGNORED_DIRS = new Set([".git", ".plasmo", "build", "coverage", "node_modules"])
const RAW_COLOR_PATTERN = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/g
const FONT_SIZE_PATTERN = /font-size:\s*([^;]+)/g

function* walk(path) {
  const stat = statSync(path, { throwIfNoEntry: false })
  if (!stat) return
  if (stat.isDirectory()) {
    const name = path.split("/").at(-1)
    if (name && IGNORED_DIRS.has(name)) return
    for (const entry of readdirSync(path).sort()) yield* walk(join(path, entry))
    return
  }
  if (CODE_EXTENSIONS.has(extname(path))) yield path
}

function checkFile(filePath) {
  if (TOKEN_FILES.has(filePath)) return []
  const text = readFileSync(filePath, "utf8")
  const errors = []

  const pageInjected = PAGE_INJECTED_FILES.has(filePath)

  if (!pageInjected && /\bstyle\s*=/.test(text)) errors.push("Inline style attributes/props are banned. Add a tokenized primitive instead.")

  if (!CANVAS_COLOR_FILES.has(filePath) && !pageInjected) {
    for (const match of text.matchAll(RAW_COLOR_PATTERN)) {
      errors.push(`Raw color '${match[0]}' is banned outside src/style.css.`)
    }
  }

  if (filePath.endsWith(".css")) {
    for (const match of text.matchAll(FONT_SIZE_PATTERN)) {
      const value = match[1].trim()
      if (value.startsWith("var(")) continue
      errors.push("CSS font sizes must use root typography tokens.")
    }
  }

  return errors
}

const failures = []
for (const filePath of walk("src")) {
  for (const error of checkFile(filePath)) failures.push(`${filePath}: ${error}`)
}

if (failures.length > 0) {
  console.error("Design primitive drift detected:")
  for (const failure of failures) console.error(`  ${failure}`)
  process.exit(1)
}

console.log("Design primitives check passed.")