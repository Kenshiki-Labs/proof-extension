// Staleness gate for the intelligence SSOT, run as part of `pnpm qa`.
// Regenerates every derived artifact and fails if any byte changed —
// catching both "someone edited a source without regenerating" and
// nondeterminism in the pipeline itself.
import { createHash } from "node:crypto"
import { execSync } from "node:child_process"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const WATCHED = ["intelligence/normalized", "intelligence/eval", "intelligence/snapshots", "intelligence/entity-ledger.json", "intelligence/adjudication"]

function* walk(path) {
  if (!statSync(path, { throwIfNoEntry: false })) return
  if (statSync(path).isFile()) {
    yield path
    return
  }
  for (const entry of readdirSync(path).sort()) yield* walk(join(path, entry))
}

function fingerprint() {
  const hashes = {}
  for (const root of WATCHED) {
    for (const file of walk(root)) hashes[file] = createHash("sha256").update(readFileSync(file)).digest("hex")
  }
  return hashes
}

const before = fingerprint()
execSync("node scripts/normalize-intelligence.mjs", { stdio: "pipe" })
execSync("node scripts/eval-entity-resolution.mjs", { stdio: "pipe" })
const after = fingerprint()

const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((file) => before[file] !== after[file])
if (changed.length > 0) {
  console.error("Intelligence artifacts are stale — regeneration changed:")
  for (const file of changed) console.error(`  ${file}`)
  console.error("Run `pnpm intel:normalize && pnpm intel:eval` and commit the results.")
  process.exit(1)
}
console.log(`Intelligence artifacts fresh (${Object.keys(after).length} files verified byte-identical after regeneration).`)
