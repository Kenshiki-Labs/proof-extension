import { readFileSync, readdirSync, statSync } from "node:fs"
import { extname, join } from "node:path"

const CODE_EXTENSIONS = new Set([".css", ".js", ".jsx", ".ts", ".tsx"])
const TOKEN_FILES = new Set(["src/style.css", "src/components/system/tokens.ts"])
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

  if (/\bstyle\s*=/.test(text)) errors.push("Inline style attributes/props are banned. Add a tokenized primitive instead.")

  for (const match of text.matchAll(RAW_COLOR_PATTERN)) {
    errors.push(`Raw color '${match[0]}' is banned outside src/style.css.`)
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