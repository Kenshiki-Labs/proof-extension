import { describe, expect, it } from "vitest"

import { DETECTION_RULES, patternById, patternsByFamily } from "./rules"

describe("rule lookups", () => {
  it("finds a pattern by id_base and returns null for an unknown id", () => {
    const first = DETECTION_RULES[0]
    expect(patternById(first.id_base)?.id_base).toBe(first.id_base)
    expect(patternById("no-such-rule")).toBeNull()
  })

  it("filters patterns by family and returns [] for an unknown family", () => {
    const family = DETECTION_RULES[0].family
    const matched = patternsByFamily(family)
    expect(matched.length).toBeGreaterThan(0)
    expect(matched.every((rule) => rule.family === family)).toBe(true)
    expect(patternsByFamily("no-such-family")).toEqual([])
  })
})
