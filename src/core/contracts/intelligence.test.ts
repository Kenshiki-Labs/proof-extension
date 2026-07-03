import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import {
  NormalizedBrokersSchema,
  NormalizedCaliforniaBrokersSchema,
  NormalizedDefenseDestinationsSchema,
  NormalizedEntitiesSchema
} from "./intelligence"

const root = resolve(__dirname, "../../..")
const brokersRaw = JSON.parse(readFileSync(resolve(root, "intelligence/normalized/brokers.json"), "utf8"))
const destinationsRaw = JSON.parse(readFileSync(resolve(root, "intelligence/normalized/defense-destinations.json"), "utf8"))
const californiaRaw = JSON.parse(readFileSync(resolve(root, "intelligence/normalized/ca-brokers-2026.json"), "utf8"))
const entitiesRaw = JSON.parse(readFileSync(resolve(root, "intelligence/normalized/entities.json"), "utf8"))

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

describe("normalized California 2026 registry", () => {
  const california = NormalizedCaliforniaBrokersSchema.parse(californiaRaw)

  it("validates against the import contract with state_registry provenance", () => {
    expect(california.sources[0]?.family).toBe("state_registry")
    expect(california.records.length).toBe(581)
  })

  it("has unique, sorted broker ids", () => {
    const ids = california.records.map((record) => record.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)))
  })

  it("carries the disclosures no other source has", () => {
    const genAiSellers = california.records.filter((record) => record.sharedOrSoldTo.genAiDevelopers === "yes")
    const lawEnforcementSellers = california.records.filter((record) => record.sharedOrSoldTo.lawEnforcement === "yes")
    const withDeleteMetrics = california.records.filter((record) => (record.ccpaMetrics.deleteRequests.received ?? 0) > 0)
    expect(genAiSellers.length).toBeGreaterThan(0)
    expect(lawEnforcementSellers.length).toBeGreaterThan(0)
    expect(withDeleteMetrics.length).toBeGreaterThan(50)
  })

  it("pins the transform for a known broker", () => {
    expect(california.records.find((record) => record.name === "01Advertising Inc.")).toMatchSnapshot()
  })
})

describe("entity SSOT index", () => {
  const entities = NormalizedEntitiesSchema.parse(entitiesRaw)

  it("has unique, sorted entity ids and unique domain ownership", () => {
    const ids = entities.records.map((record) => record.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)))

    const domains = entities.records.flatMap((record) => record.domains)
    expect(new Set(domains).size).toBe(domains.length)
  })

  it("joins the 2025 and 2026 registries beyond exact-name matching", () => {
    const crossYear = entities.records.filter(
      (record) => record.facets.broker2025Ids.length > 0 && record.facets.caRegistry2026Ids.length > 0
    )
    expect(crossYear.length).toBeGreaterThan(400)
  })

  it("anchors every runtime company exactly once so observers can reach broker intelligence", () => {
    const companyIds = entities.records.flatMap((record) => record.facets.companyIds)
    // 27 companies, each in exactly one entity — though one entity may hold
    // several (Google Analytics + Tag Manager resolve to one Alphabet entity).
    expect(companyIds.length).toBe(27)
    expect(new Set(companyIds).size).toBe(27)
    const anchored = entities.records.filter((record) => record.facets.companyIds.length > 0)
    for (const entity of anchored) expect(entity.facets.trackerIds.length).toBeGreaterThan(0)
  })

  it("references only records that exist in the per-source files", () => {
    const broker2025 = new Set(NormalizedBrokersSchema.parse(brokersRaw).records.map((record) => record.id))
    const ca2026 = new Set(NormalizedCaliforniaBrokersSchema.parse(californiaRaw).records.map((record) => record.id))
    const defense = new Set(NormalizedDefenseDestinationsSchema.parse(destinationsRaw).records.map((record) => record.id))
    for (const entity of entities.records) {
      for (const id of entity.facets.broker2025Ids) expect(broker2025).toContain(id)
      for (const id of entity.facets.caRegistry2026Ids) expect(ca2026).toContain(id)
      for (const id of entity.facets.defenseDestinationIds) expect(defense).toContain(id)
    }
  })
})
