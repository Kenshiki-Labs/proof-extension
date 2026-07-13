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

// Two defect shapes recurred across the pattern table (dead proximity tails
// and unboundaried short tokens), so the shapes themselves are linted here in
// addition to the specific regressions below.
describe("pattern shape lint", () => {
  it("no branch ends in a dead proximity window — `[^.]{0,N}` before `|` or end binds to nothing", () => {
    for (const rule of DETECTION_RULES) {
      const source = rule.pattern.source
      expect(source, `${rule.id_base} has a proximity window ending a branch (dead tail)`).not.toMatch(/\{\d+,\d+\}(\||$)/)
    }
  })
})

describe("false-positive regressions", () => {
  it("a lone refund disclaimer is not an auto-renewal clause", () => {
    const rule = patternById("auto_renew_nonrefundable")!
    expect(rule.pattern.test("All sales are final and no refunds are provided for one-time purchases.")).toBe(false)
    expect(rule.pattern.test("Your subscription will automatically renew each month and payments are non-refundable.")).toBe(true)
    expect(rule.pattern.test("Charges are non-refundable; plans auto-renew until cancelled.")).toBe(true)
  })

  it("'allocation data' and 'colocation information' are not location collection", () => {
    const rule = patternById("location_collection")!
    expect(rule.pattern.test("We publish resource allocation data quarterly.")).toBe(false)
    expect(rule.pattern.test("Our colocation information page lists data centers.")).toBe(false)
    expect(rule.pattern.test("We collect precise geolocation from your device.")).toBe(true)
    expect(rule.pattern.test("We may collect location data when you use the app.")).toBe(true)
  })

  it("'minority' and 'underrepresented' are not children's-data handling", () => {
    const rule = patternById("children_data")!
    expect(rule.pattern.test("We support minority-owned and underrepresented businesses.")).toBe(false)
    expect(rule.pattern.test("We do not knowingly collect information from children under 13.")).toBe(true)
    expect(rule.pattern.test("Parental consent is required for users under the age of 18.")).toBe(true)
  })

  it("boilerplate 'third-party sources' without enrichment context is not broker enrichment", () => {
    const rule = patternById("data_broker_enrichment")!
    expect(rule.pattern.test("Links to third-party sources are provided for convenience.")).toBe(false)
    expect(rule.pattern.test("We obtain information about you from data brokers.")).toBe(true)
    expect(rule.pattern.test("We may supplement your profile with information obtained from outside sources.")).toBe(true)
    expect(rule.pattern.test("Information from third-party sources may be combined with data we collect.")).toBe(true)
  })
})
