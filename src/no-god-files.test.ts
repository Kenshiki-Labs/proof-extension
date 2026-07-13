import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

import { describe, expect, it } from "vitest"

// No god files: every source module stays at or under the limit. The two
// declarative tables above it are grandfathered at their current size and may
// only shrink — when one does, this baseline must be lowered in the same
// commit, so the headroom can never be spent on new growth.
const LINE_LIMIT = 450
const SHRINK_ONLY_BASELINE: Record<string, number> = {
  "src/core/atlas/rules.ts": 482
}

const SRC_ROOT = join(__dirname, "..")

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    if (!/\.(ts|tsx)$/.test(entry) || /\.test\.(ts|tsx)$/.test(entry)) return []
    return [path]
  })
}

function lineCount(path: string): number {
  return readFileSync(path, "utf8").split("\n").length
}

describe("no god files", () => {
  const files = sourceFiles(join(SRC_ROOT, "src"))

  it("finds the source tree", () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it(`keeps every source file at or under ${LINE_LIMIT} lines (baseline files: shrink-only)`, () => {
    const oversized = files
      .map((path) => ({ file: relative(SRC_ROOT, path), lines: lineCount(path) }))
      .filter(({ file, lines }) => lines > (SHRINK_ONLY_BASELINE[file] ?? LINE_LIMIT))

    expect(oversized, `Over the limit — split these instead of growing them: ${JSON.stringify(oversized)}`).toEqual([])
  })

  it("ratchets the baseline down as its files shrink", () => {
    for (const [file, baseline] of Object.entries(SHRINK_ONLY_BASELINE)) {
      expect(baseline, `${file} baseline is under the limit — delete its entry, the general rule covers it`).toBeGreaterThan(LINE_LIMIT)
      const lines = lineCount(join(SRC_ROOT, file))
      expect(
        lines,
        lines > baseline
          ? `${file} grew past its baseline ${baseline} — split it instead`
          : `${file} shrank to ${lines} — lower (or delete) its baseline so the headroom cannot be re-spent`
      ).toBe(baseline)
    }
  })
})
