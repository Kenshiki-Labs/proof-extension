import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { NormalizedBrokersSchema, NormalizedDefenseDestinationsSchema } from "./intelligence"

const root = resolve(__dirname, "../../..")
const brokersRaw = JSON.parse(readFileSync(resolve(root, "intelligence/normalized/brokers.json"), "utf8"))
const destinationsRaw = JSON.parse(readFileSync(resolve(root, "intelligence/normalized/defense-destinations.json"), "utf8"))

describe("normalized broker registry", () => {
  const brokers = NormalizedBrokersSchema.parse(brokersRaw)

  it("validates against the import contract with state_registry provenance", () => {
    expect(brokers.sources[0]?.family).toBe("state_registry")
    expect(brokers.review.status).toBe("source_backed")
    expect(brokers.records.length).toBe(750)
  })

  it("has unique, sorted broker ids", () => {
    const ids = brokers.records.map((record) => record.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)))
  })

  it("merges multi-state filings into one record per broker", () => {
    const multiState = brokers.records.filter((record) => record.registrySources.length > 1)
    expect(multiState.length).toBeGreaterThan(100)
  })

  it("keeps opt-out and contact coverage worth importing", () => {
    expect(brokers.records.filter((record) => record.optOutUrls.length > 0).length).toBeGreaterThan(500)
    expect(brokers.records.filter((record) => record.emails.length > 0).length).toBeGreaterThan(600)
  })

  it("pins the transform for a known multi-state broker", () => {
    const broker = brokers.records.find((record) => record.name === "01Advertising Inc.")
    expect(broker).toMatchSnapshot()
  })
})

describe("normalized defense destinations", () => {
  const destinations = NormalizedDefenseDestinationsSchema.parse(destinationsRaw)

  it("validates against the import contract with kenshiki_defense_registry provenance", () => {
    expect(destinations.sources[0]?.family).toBe("kenshiki_defense_registry")
    expect(destinations.upstreamSchema).toBe("defense-registry.v3-harm")
    expect(destinations.records.length).toBe(105)
  })

  it("has unique, sorted destination ids", () => {
    const ids = destinations.records.map((record) => record.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)))
  })

  it("separates defenders from predators via actor class", () => {
    const classes = new Set(destinations.records.map((record) => record.actorClass))
    expect(classes).toContain("people_search_broker")
    expect(classes).toContain("regulated_cra")
    expect(classes).toContain("privacy_tool")
  })

  it("pins the transform for a known destination", () => {
    const destination = destinations.records.find((record) => record.id === "equifax_freeze")
    expect(destination).toMatchSnapshot()
  })
})
